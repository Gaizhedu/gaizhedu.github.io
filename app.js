import { formatQuestionText, plainQuestionText } from './question-format.js';
import { LETTERS, buildJourney, GameSession, StepMovement, HeldDirection, MonsterApproach, AnswerDelay } from './game-core.js';
import { BANK_KEY, describeBank, selectBank } from './question-banks.js';
import { loadHistory, addResult, saveHistory } from './history.js';
import { BLOCK, Terrain, Jumper, hitsHeadChest, AnswerEffect } from './world.js';

const $ = selector => document.querySelector(selector);
const panel = $('#action-panel');
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const resultDialog = $('#result-dialog');
const drawer = $('#history-drawer');
const bankDrawer = $('#bank-drawer');
let bankCatalog = [], selectedBank = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let config, bank, images, session = null, movement = new StepMovement();
let width = 0, height = 0, floor = 0, scale = 1;
let elapsed = 0, previousTime = 0;
let terrain = new Terrain(), jumper = new Jumper(), effect = null, chestBump = 0;
const heldInput = new HeldDirection();
const answerDelay = new AnswerDelay();
let monster = null, monsterBody = new Jumper(), answersLocked = false;
let runId = '', recorded = false;
let storage;
try { storage = localStorage; } catch { storage = null; }
let history = loadHistory(storage), historySaved = true;

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url}（${response.status}）。`);
  return response.json();
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`素材加载失败：${src}`));
    image.src = src;
  });
}
function announce(message) { $('#announcement').textContent = message; }
function playerPosition() { return width / 2 - Math.min(width * .255, height * .22); }
function prepareEncounter() {
  const event = session.currentEvent;
  // Keep the entire sprite beyond the right edge before it starts walking in.
  monster = event?.kind === 'monster' ? new MonsterApproach(Math.max(event.distance,
    movement.position + (width - playerPosition() + spriteSize() / 2) / scale - 130)) : null;
  monsterBody = new Jumper(monster ? terrain.heightAt(monster.position + 130) : 0);
}
function encounterDistance() { return monster?.position ?? session.currentEvent.distance; }
function movementLimit() {
  if (session.currentEvent?.head) return session.encounters[session.eventIndex + 1]?.distance ?? Infinity;
  return Math.min(session.currentEvent.distance, encounterDistance());
}
function canMove() { return session && !effect && ['explore', 'walking'].includes(session.phase) && !drawer.open && !bankDrawer.open && !resultDialog.open; }
function clearInput(stop = false) {
  heldInput.clear();
  if (stop) { movement.stop();session?.stopWalking(); }
}
function beginInput(source, direction) {
  if (!canMove()) return;
  heldInput.press(source, direction);
  move(direction);
}
function endInput(source) { heldInput.release(source); }
function renderReady() {
  panel.className = '';
  panel.innerHTML = '<button id="start-button" class="pixel-button">开始游戏</button>';
  $('#start-button').addEventListener('click', startGame);
}
function startGame() {
  if (resultDialog.open) resultDialog.close();
  const events = buildJourney(bank, selectedBank.ratios, Math.random, selectedBank.totalQuestionRatio);
  session = new GameSession(events.map(event => event.question), events);
  movement = new StepMovement();clearInput();
  terrain = new Terrain(events);jumper = new Jumper();effect = null;chestBump = 0;
  prepareEncounter();answersLocked = false;
  runId = crypto.randomUUID();recorded = false;
  renderControls();
  $('#advance-button').focus({ preventScroll: true });
  announce('游戏开始。左右移动，上箭头跳上台阶；悬空宝箱可跳起顶开，也可直接路过。');
}
function renderControls() {
  panel.className = '';
  panel.innerHTML = '<div class="movement-controls"><button class="arrow-button left" id="retreat-button" aria-label="后退"><img src="assets/ui/left.png" alt="" draggable="false"></button><button class="arrow-button up" id="jump-button" aria-label="跳跃"><img src="assets/ui/upper.png" alt="" draggable="false"></button><button class="arrow-button right" id="advance-button" aria-label="前进"><img src="assets/ui/right.png" alt="" draggable="false"></button></div>';
  const hint = document.createElement('div');hint.className = 'movement-hint';
  hint.textContent = session.currentEvent?.head ? '↑ 顶开悬空宝箱 · 也可直接路过' : '← → 移动 · ↑ 跳上台阶';panel.append(hint);
  $('#jump-button').addEventListener('click', jump);
  for (const [id, direction] of [['retreat-button', -1], ['advance-button', 1]]) {
    const button = $('#' + id);
    button.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();button.setPointerCapture(event.pointerId);
      beginInput('pointer:' + event.pointerId, direction);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => endInput('pointer:' + event.pointerId));
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', event => { if (event.detail === 0) move(direction); });
  }
}
function jump() {
  if (canMove()) jumper.jump();
}
function move(direction) {
  if (!canMove()) return;
  if (movement.step(direction, movementLimit())) session.advance();
}
function renderBattle() {
  clearInput(true);
  const question = session.current;
  const event = session.currentEvent;
  panel.className = event.kind === 'chest' ? 'battle treasure' : 'battle';
  canvas.setAttribute('aria-label', event.kind === 'chest' ? '骑士遇到了宝箱' : event.final ? '骑士遇到了头顶钻石的最后一只怪物' : '骑士遇到了怪物');
  panel.innerHTML = `<div class="question-panel">${event.kind === 'chest' ? `<div class="encounter-label">${event.head ? '顶头宝箱挑战' : '宝箱挑战'}</div>` : ''}<h1 id="question-title">${formatQuestionText(question.question)}</h1><div class="options" role="group" aria-labelledby="question-title">${LETTERS.map((letter, i) => `<button class="option" data-answer="${letter}"><span>${letter}.</span><span>${formatQuestionText(question.options[i])}</span></button>`).join('')}</div></div>`;
  answerDelay.start(performance.now());answersLocked = true;
  panel.querySelectorAll('[data-answer]').forEach(button => {
    button.disabled = true;
    button.addEventListener('click', () => submitAnswer(button.dataset.answer));
  });
  // Do not focus an answer while a movement key may still be held down.
  const title = $('#question-title');title.tabIndex = -1;title.focus({ preventScroll: true });
  announce(`${event.kind === 'chest' ? '宝箱' : '怪物'}题目：${plainQuestionText(question.question)}`);
}
function submitAnswer(letter) {
  if (bankDrawer.open || drawer.open || effect || session?.phase !== 'battle' || !answerDelay.ready(performance.now())) return;
  const event = session.currentEvent;
  const position = encounterDistance() + (event.head ? 0 : 130);
  const elevation = event.kind === 'monster' ? monsterBody.feet : terrain.heightAt(position);
  if (!session?.answer(letter)) return;
  clearInput(true);answersLocked = false;
  effect = new AnswerEffect(event, position, elevation);
  panel.className = '';panel.replaceChildren();
  announce('挥剑！');
}
function finishAnswerEffect() {
  effect = null;
  if (session.phase === 'finished') {
    panel.className = '';panel.replaceChildren();showResult();
  } else {
    prepareEncounter();
    renderControls();
    // Take one step after answering; further movement is controlled by the player.
    move(1);announce('已作答，继续探索。');
  }
}
function showResult() {
  if (!recorded) {
    history = addResult(history, { id: runId, at: Date.now(), correct: session.correct, total: session.answers.length });
    recorded = true;historySaved = saveHistory(storage, history);updateHistoryCount();
  }
  resultDialog.innerHTML = `<h2 id="result-title">游戏结束</h2><p class="result-score">答对 <strong>${session.correct}</strong><span>/ ${session.answers.length} 题</span></p><p class="result-points">${session.score} 分</p><details class="review"><summary>题目详情</summary>${session.answers.map((record, index) => `<article class="review-item"><h3>${index + 1}. ${record.head ? '【头顶宝箱】' : record.kind === 'chest' ? '【路上宝箱】' : ''}${formatQuestionText(record.question.question)}</h3><ul class="review-options">${LETTERS.map((letter, i) => `<li>${letter}. ${formatQuestionText(record.question.options[i])}</li>`).join('')}</ul><p class="${record.isCorrect ? 'answer-right' : 'answer-wrong'}">你的答案：${record.selected}（${record.isCorrect ? '正确' : '错误'}）</p><p class="answer-right">正确答案：${record.question.correct}. ${formatQuestionText(record.question.options[LETTERS.indexOf(record.question.correct)])}</p><p>${formatQuestionText(record.question.explanation || '本题暂无补充解析。')}</p></article>`).join('')}</details><div class="result-actions"><button id="result-history-button" class="secondary-button">游玩记录</button><button id="replay-button" class="pixel-button">重新开始</button></div>`;
  const bankAction = document.createElement('button');bankAction.className = 'secondary-button';bankAction.textContent = '切换题库';
  const counts = document.createElement('p');counts.className = 'result-counts';
  counts.textContent = `击败怪物及完成路上宝箱：${session.roadCompleted} 题；开启头顶宝箱：${session.headOpened} / ${session.encounters.filter(event => event.head).length} 个。`;
  resultDialog.querySelector('.result-points').after(counts);
  bankAction.addEventListener('click', openBanks);$('.result-actions').append(bankAction);
  $('#replay-button').addEventListener('click', startGame);
  $('#result-history-button').addEventListener('click', openHistory);
  resultDialog.showModal();$('#replay-button').focus({ preventScroll: true });
  announce(`游戏结束，答对 ${session.correct} 题，${session.score} 分。`);
}
resultDialog.addEventListener('cancel', event => event.preventDefault());
function updateHistoryCount() { $('#play-count').textContent = history.totalRuns; }
function openHistory() {
  clearInput(true);
  $('#history-content').innerHTML = `${!historySaved ? '<p class="history-note">当前浏览器无法保存记录，刷新后本次成绩可能丢失。</p>' : ''}${history.records.length ? `<ol class="history-list">${history.records.map(record => `<li><div>答对 <strong>${record.correct}</strong><span> / ${record.total} 题</span></div><strong class="history-score">${record.score}<small> 分</small></strong></li>`).join('')}</ol>` : '<p class="history-empty">还没有完成的游戏记录</p>'}`;
  drawer.showModal();
}
$('#history-button').addEventListener('click', openHistory);
$('#close-history').addEventListener('click', () => drawer.close());
// Clicking the shaded region closes the drawer without changing the run.
 drawer.addEventListener('click', event => { if (event.target === drawer && event.clientX < drawer.getBoundingClientRect().left) drawer.close(); });
window.addEventListener('storage', event => { if (event.key === 'knowledge-quest-history-v1') { history = loadHistory(storage);updateHistoryCount(); } });
updateHistoryCount();

function openBanks() {
  clearInput(true);
  const list = $('#bank-list');list.replaceChildren();
  for (const entry of bankCatalog) {
    const button = document.createElement('button');button.className = 'bank-choice';
    const current = entry.id === selectedBank?.id;
    if (current) button.setAttribute('aria-current', 'true');
    button.disabled = current || Boolean(entry.error);
    const title = document.createElement('strong');title.textContent = entry.title;
    const detail = document.createElement('span');
    detail.textContent = entry.error || `${entry.questions.length} 道题${current ? ' · 当前题库' : ''}`;
    button.append(title, detail);
    button.addEventListener('click', () => {
      try { storage?.setItem(BANK_KEY, entry.id); } catch { /* URL also preserves selection. */ }
      const url = new URL(location.href);url.searchParams.set('bank', entry.id);
      location.assign(url.href);
    });
    list.append(button);
  }
  bankDrawer.showModal();$('#bank-button').setAttribute('aria-expanded', 'true');
  $('#close-bank').focus({ preventScroll: true });
}
$('#bank-button').addEventListener('click', openBanks);
$('#close-bank').addEventListener('click', () => bankDrawer.close());
bankDrawer.addEventListener('close', () => $('#bank-button').setAttribute('aria-expanded', 'false'));
bankDrawer.addEventListener('click', event => {
  if (event.target === bankDrawer && event.clientX > bankDrawer.getBoundingClientRect().right) bankDrawer.close();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();const dpr = Math.min(devicePixelRatio || 1, 2);
  width = rect.width;height = rect.height;
  canvas.width = Math.round(width * dpr);canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);ctx.imageSmoothingEnabled = false;
  floor = panel.offsetTop;scale = Math.max(.45, Math.min(width / 603, height / 904));
}
function spriteSize() { return Math.min(384 * scale, floor * .72); }
function drawSprite(image, definition, x, walking, jumpOffset = 0, row = definition.row) {
  const size = spriteSize();
  const baseline = row === definition.leftRow ? (definition.leftBaseline ?? definition.baseline) : definition.baseline;
  const frame = walking && !reducedMotion ? Math.floor(elapsed / 115) % definition.frames : 0;
  ctx.drawImage(image, frame * definition.cellSize, (row - 1) * definition.cellSize, definition.cellSize, definition.cellSize, Math.round(x - size / 2), Math.round(floor - size * baseline / definition.cellSize - jumpOffset), size, size);
}
function playerHeight() { return spriteSize() / scale * .69; }
function chestBottom(event) { return terrain.heightAt(event.distance) + playerHeight() + 42; }
function worldX(position) { return playerPosition() + (position - movement.position) * scale; }
function drawChest(event, position, opacity = 1, lift = 0) {
  ctx.save();ctx.globalAlpha = opacity;
  const x = worldX(position);
  if (event.head) {
    const itemWidth = 100 * scale, itemHeight = itemWidth * 120 / 167;
    const bump = reducedMotion ? 0 : Math.sin(chestBump / 260 * Math.PI) * 16 * scale;
    ctx.drawImage(images.headChest, 17, 45, 167, 120, x - itemWidth / 2,
      floor - chestBottom(event) * scale - itemHeight - bump - lift, itemWidth, itemHeight);
    if (canMove()) {
      ctx.fillStyle = '#fff0bf';ctx.font = `bold ${Math.max(12, 19 * scale)}px sans-serif`;ctx.textAlign = 'center';
      ctx.fillText('↑', x, floor - chestBottom(event) * scale + 25 * scale);
    }
  } else {
    const image = images['chest' + event.variant], itemWidth = 155 * scale, itemHeight = itemWidth * image.height / image.width;
    ctx.drawImage(image, x - itemWidth / 2, floor - terrain.heightAt(position) * scale - itemHeight - lift, itemWidth, itemHeight);
  }
  ctx.restore();
}
function drawAnswerEffect() {
  const p = effect.progress, recoil = Math.max(0, (p - .2) / .8);
  if (effect.event.kind === 'monster') {
    const x = worldX(effect.position), foot = floor - effect.elevation * scale;
    ctx.save();ctx.globalAlpha = 1 - recoil;
    if (!reducedMotion) {
      ctx.translate(x + recoil * 80 * scale, foot - Math.sin(recoil * Math.PI) * 36 * scale);
      ctx.rotate(recoil * 1.35);ctx.translate(-x, -foot);
    }
    drawSprite(images.enemy, config.enemy, x, false, effect.elevation * scale);
    ctx.restore();
  } else drawChest(effect.event, effect.position, 1 - recoil, reducedMotion ? 0 : recoil * 36 * scale);
  const x = playerPosition(), y = floor - (jumper.feet + playerHeight() + 44) * scale;
  const swordSize = 86 * scale;
  ctx.save();ctx.globalAlpha = Math.min(1, p * 8) * Math.min(1, (1 - p) * 5);
  ctx.translate(x, y - (reducedMotion ? 0 : Math.sin(p * Math.PI) * 22 * scale));
  if (!reducedMotion) ctx.rotate(-.9 + p * 2.1);
  const pop = reducedMotion ? 1 : .7 + .3 * Math.sin(Math.min(1, p * 3) * Math.PI / 2);
  ctx.scale(pop, pop);ctx.drawImage(images.sword, -swordSize / 2, -swordSize / 2, swordSize, swordSize);
  ctx.restore();
}
function draw(time) {
  requestAnimationFrame(draw);
  const delta = previousTime ? Math.min(time - previousTime, 50) : 0;previousTime = time;
  if (document.hidden) return;
  const paused = drawer.open || bankDrawer.open || resultDialog.open;
  if (!paused) elapsed += delta;
  if (answersLocked && session?.phase === 'battle' && answerDelay.ready(performance.now())) {
    panel.querySelectorAll('[data-answer]').forEach(button => { button.disabled = false; });answersLocked = false;
  }
  if (!paused) {
    if (chestBump > 0) chestBump = Math.max(0, chestBump - delta);
    if (effect && effect.tick(delta)) finishAnswerEffect();
    const previousFeet = jumper.feet, wasRising = jumper.velocity > 0;
    jumper.tick(delta, terrain.heightAt(movement.position));
    if (monster) monsterBody.tick(delta, terrain.heightAt(monster.position + 130));
    if (canMove()) {
      const event = session.currentEvent;
      const repeatDirection = heldInput.tick(delta, movement.moving);
      if (repeatDirection) move(repeatDirection);
      let touched = false;
      if (movement.moving) {
        const previousPosition = movement.position;
        touched = movement.tick(delta, movementLimit());
        const allowed = terrain.limit(previousPosition, movement.position, jumper.feet);
        if (allowed !== movement.position) {
          movement.position = allowed;movement.stop();touched = false;
        }
        if (!movement.moving) session.stopWalking();
      }
      if (monster) {
        const oldX = monster.position + 130;
        if (terrain.heightAt(oldX - 8) > monsterBody.feet) monsterBody.jump();
        monster.tick(delta, movement.position);
        monster.position = terrain.limit(oldX, monster.position + 130, monsterBody.feet) - 130;
        touched = monster.position <= movement.position;
      }
      if (event.head) {
        touched = hitsHeadChest({playerX: movement.position, chestX: event.distance,
          previousHead: previousFeet + playerHeight(), head: jumper.feet + playerHeight(),
          bottom: chestBottom(event), rising: wasRising});
        if (touched) { jumper.feet = chestBottom(event) - playerHeight();jumper.velocity = 0;chestBump = 260; }
      }
      if (touched) { session.advance();if (session.encounter()) renderBattle(); }
      else if (session.skipHeadChest(movement.position)) {
        prepareEncounter();
        const hint = panel.querySelector('.movement-hint');
        if (hint) hint.textContent = session.currentEvent?.head ? '↑ 顶开悬空宝箱 · 也可直接路过' : '← → 移动 · ↑ 跳上台阶';
        announce('已路过可选宝箱，继续探索。');
      }
    }
  }
  const scroll = movement.position * scale;
  ctx.fillStyle = '#262533';ctx.fillRect(0, 0, width, height);
  const bgWidth = Math.round(images.bookshelf.width * scale), bgHeight = Math.round(images.bookshelf.height * scale);
  const bgOffset = (scroll * .65 + bgWidth * .78) % bgWidth;
  for (let y = floor - bgHeight; y > -bgHeight; y -= bgHeight) for (let x = -bgOffset; x < width; x += bgWidth) ctx.drawImage(images.bookshelf, Math.floor(x), Math.floor(y), bgWidth + 1, bgHeight + 1);
  const tile = BLOCK * scale;
  const firstColumn = Math.floor((movement.position - playerPosition() / scale) / BLOCK);
  const lastColumn = Math.ceil((movement.position + (width - playerPosition()) / scale) / BLOCK);
  for (let column = firstColumn; column <= lastColumn; column++) {
    const x = worldX(column * BLOCK), top = floor - terrain.heightAt(column * BLOCK) * scale;
    for (let y = top; y < height; y += tile) ctx.drawImage(images.ground, Math.floor(x), Math.floor(y), Math.ceil(tile) + 1, Math.ceil(tile) + 1);
    ctx.fillStyle = '#bcadcf88';ctx.fillRect(Math.floor(x), Math.floor(top), Math.ceil(tile) + 1, 2);
  }
  drawSprite(images.player, config.player, playerPosition(), movement.moving, jumper.feet * scale, movement.direction === -1 ? config.player.leftRow : config.player.row);
  // Chests occupy fixed world positions from the beginning, including future encounters.
  for (let i = session?.eventIndex ?? 0; session && i < session.encounters.length; i++) {
    const chest = session.encounters[i];
    if (chest.kind !== 'chest') continue;
    const position = chest.distance + (chest.head ? 0 : 130), x = worldX(position);
    if (x < -155 * scale || x > width + 155 * scale) continue;
    const opacity = chest.head ? Math.max(0, Math.min(1, (chest.distance + 220 - movement.position) / 60)) : 1;
    drawChest(chest, position, opacity);
  }
  const event = session?.currentEvent;
  if (effect) drawAnswerEffect();
  else if (event?.kind === 'monster') {
    const position = encounterDistance() + (event.head ? 0 : 130), x = worldX(position);
    {
      const elevation = event.kind === 'monster' ? monsterBody.feet : terrain.heightAt(position);
      drawSprite(images.enemy, config.enemy, x, canMove(), elevation * scale);
      if (event.final) {
        const itemWidth = 58 * scale, itemHeight = itemWidth * images.diamond.height / images.diamond.width;
        ctx.drawImage(images.diamond, x - itemWidth / 2, floor - elevation * scale - spriteSize() * .68 - itemHeight - 15 * scale, itemWidth, itemHeight);
      }
    }
  }
}
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || resultDialog.open || drawer.open || bankDrawer.open || !bank) return;
  if (event.target.closest('#bank-button') && ['Space', 'Enter'].includes(event.code)) return;
  if (!session && ['Space', 'Enter'].includes(event.code)) { if (!event.repeat) { event.preventDefault();startGame(); }return; }
  if (['ArrowRight', 'ArrowLeft', 'Space'].includes(event.code) && canMove()) {
    if (event.code === 'Space' && event.target.closest('#history-button')) return;
    event.preventDefault();if (!event.repeat) beginInput('key:' + event.code, event.code === 'ArrowLeft' ? -1 : 1);
  } else if (event.code === 'ArrowUp') { event.preventDefault();if (!event.repeat) jump(); }
  else if (/^[1-4]$/.test(event.key) && session?.phase === 'battle' && !event.repeat) { event.preventDefault();submitAnswer(LETTERS[Number(event.key) - 1]); }
});
document.addEventListener('keyup', event => endInput('key:' + event.code));
window.addEventListener('blur', () => clearInput(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(true); });

async function init() {
  try {
    config = await getJSON('config.json');
    let files;try { files = await getJSON('question/index.json'); } catch { files = config.questionFiles; }
    if (!Array.isArray(files) || !files.length) throw new Error('question 文件夹中没有 JSON 题库。');
    const sources = [config.player.src, config.enemy.src, 'assets/Background/bookshelf.png', 'assets/ground/single_block.png', 'assets/ui/upper.png', 'assets/ui/right.png', 'assets/ui/left.png', 'assets/items/chest_1.png', 'assets/items/chest_2.png', 'assets/items/diamond.png', 'assets/items/sword.png', 'assets/items/chest_head.png'];
    const [banks, loaded] = await Promise.all([Promise.allSettled(files.map(file => getJSON(`question/${encodeURIComponent(file)}`))), Promise.all(sources.map(loadImage))]);

    bankCatalog = banks.map((result, i) => result.status === 'fulfilled' ? describeBank(result.value, files[i]) :
      { id: files[i], title: '无法读取的题库', questions: [], error: '题库读取失败，请检查 JSON 内容。' });
    let saved;try { saved = storage?.getItem(BANK_KEY); } catch { /* Storage is optional. */ }
    const requested = new URL(location.href).searchParams.get('bank');
    selectedBank = selectBank(bankCatalog, requested, saved);
    if (!selectedBank) throw new Error('没有可用题库，每个题库至少需要 2 道不同的单选题。');
    bank = selectedBank.questions;
    try { storage?.setItem(BANK_KEY, selectedBank.id); } catch { /* Storage is optional. */ }
    $('#bank-button').disabled = false;
    $('#bank-button').title = `切换题库：${selectedBank.title}`;
    $('#bank-button').setAttribute('aria-label', `切换题库：${selectedBank.title}`);
    images = Object.fromEntries(['player', 'enemy', 'bookshelf', 'ground', 'upper', 'right', 'left', 'chest1', 'chest2', 'diamond', 'sword', 'headChest'].map((key, index) => [key, loaded[index]]));
    for (const key of ['player', 'enemy']) {
      const def = config[key];
      if (![def.row, def.frames, def.cellSize, def.baseline].every(value => Number.isInteger(value) && value > 0) || def.baseline > def.cellSize || def.row * def.cellSize > images[key].height || def.frames * def.cellSize > images[key].width) throw new Error(`${key} 精灵图配置无效。`);
    }
    renderReady();resizeCanvas();new ResizeObserver(resizeCanvas).observe(canvas);requestAnimationFrame(draw);
    if (requested) startGame();
  } catch (error) {
    panel.innerHTML = `<div class="error-panel"><p>${escapeHTML(error.message)}</p><button id="retry-button" class="pixel-button">重新加载</button></div>`;
    $('#retry-button').addEventListener('click', () => location.reload());announce(error.message);
  }
}
init();

