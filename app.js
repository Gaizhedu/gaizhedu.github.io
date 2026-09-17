import { LETTERS, normalizeQuestions, buildJourney, GameSession, StepMovement, HeldDirection } from './game-core.js';
import { loadHistory, addResult, saveHistory } from './history.js';

const $ = selector => document.querySelector(selector);
const panel = $('#action-panel');
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const resultDialog = $('#result-dialog');
const drawer = $('#history-drawer');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let config, bank, images, session = null, movement = new StepMovement();
let width = 0, height = 0, floor = 0, scale = 1;
let elapsed = 0, jumpElapsed = -1, previousTime = 0;
const heldInput = new HeldDirection();
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
function canMove() { return session && ['explore', 'walking'].includes(session.phase) && !drawer.open && !resultDialog.open; }
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
  const events = buildJourney(bank, config.questionRatio);
  session = new GameSession(events.map(event => event.question), events);
  movement = new StepMovement();clearInput();jumpElapsed = -1;
  runId = crypto.randomUUID();recorded = false;
  renderControls();
  $('#advance-button').focus({ preventScroll: true });
  announce('游戏开始。点按移动一步，长按连续移动。');
}
function renderControls() {
  panel.className = '';
  panel.innerHTML = '<div class="movement-controls"><button class="arrow-button left" id="retreat-button" aria-label="后退"><img src="assets/ui/left.png" alt="" draggable="false"></button><button class="arrow-button up" id="jump-button" aria-label="跳跃"><img src="assets/ui/upper.png" alt="" draggable="false"></button><button class="arrow-button right" id="advance-button" aria-label="前进"><img src="assets/ui/right.png" alt="" draggable="false"></button></div>';
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
  if (!canMove() || jumpElapsed >= 0) return;
  jumpElapsed = 0;
}
function move(direction) {
  if (!canMove()) return;
  if (movement.step(direction, session.currentEvent.distance)) session.advance();
}
function renderBattle() {
  clearInput(true);jumpElapsed = -1;
  const question = session.current;
  const event = session.currentEvent;
  panel.className = event.kind === 'chest' ? 'battle treasure' : 'battle';
  canvas.setAttribute('aria-label', event.kind === 'chest' ? '骑士遇到了宝箱' : event.final ? '骑士遇到了头顶钻石的最后一只怪物' : '骑士遇到了怪物');
  panel.innerHTML = `<div class="question-panel">${event.kind === 'chest' ? '<div class="encounter-label">宝箱挑战</div>' : ''}<h1 id="question-title">${escapeHTML(question.question)}</h1><div class="options" role="group" aria-labelledby="question-title">${LETTERS.map((letter, i) => `<button class="option" data-answer="${letter}"><span>${letter}.</span><span>${escapeHTML(question.options[i])}</span></button>`).join('')}</div></div>`;
  panel.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(button.dataset.answer)));
  panel.querySelector('.option').focus({ preventScroll: true });
  announce(`${event.kind === 'chest' ? '宝箱' : '怪物'}题目：${question.question}`);
}
function submitAnswer(letter) {
  if (!session?.answer(letter)) return;
  clearInput();
  if (session.phase === 'finished') {
    panel.className = '';panel.replaceChildren();showResult();
  } else {
    renderControls();
    // Take one step after answering; further movement is controlled by the player.
    move(1);announce('已作答，继续探索。');
  }
}
function showResult() {
  if (!recorded) {
    history = addResult(history, { id: runId, at: Date.now(), correct: session.correct, total: session.questions.length });
    recorded = true;historySaved = saveHistory(storage, history);updateHistoryCount();
  }
  resultDialog.innerHTML = `<h2 id="result-title">游戏结束</h2><p class="result-score">答对 <strong>${session.correct}</strong><span>/ ${session.questions.length} 题</span></p><p class="result-points">${session.score} 分</p><details class="review"><summary>题目详情</summary>${session.answers.map((record, index) => `<article class="review-item"><h3>${index + 1}. ${record.kind === 'chest' ? '【宝箱】' : ''}${escapeHTML(record.question.question)}</h3><ul class="review-options">${LETTERS.map((letter, i) => `<li>${letter}. ${escapeHTML(record.question.options[i])}</li>`).join('')}</ul><p class="${record.isCorrect ? 'answer-right' : 'answer-wrong'}">你的答案：${record.selected}（${record.isCorrect ? '正确' : '错误'}）</p><p class="answer-right">正确答案：${record.question.correct}. ${escapeHTML(record.question.options[LETTERS.indexOf(record.question.correct)])}</p><p>${escapeHTML(record.question.explanation || '本题暂无补充解析。')}</p></article>`).join('')}</details><div class="result-actions"><button id="result-history-button" class="secondary-button">游玩记录</button><button id="replay-button" class="pixel-button">重新开始</button></div>`;
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
  const frame = walking && !reducedMotion ? Math.floor(elapsed / 115) % definition.frames : 0;
  ctx.drawImage(image, frame * definition.cellSize, (row - 1) * definition.cellSize, definition.cellSize, definition.cellSize, Math.round(x - size / 2), Math.round(floor - size * definition.baseline / definition.cellSize - jumpOffset), size, size);
}
function draw(time) {
  requestAnimationFrame(draw);
  const delta = previousTime ? Math.min(time - previousTime, 50) : 0;previousTime = time;
  if (document.hidden) return;
  elapsed += delta;
  if (canMove()) {
    const repeatDirection = heldInput.tick(delta, movement.moving);
    if (repeatDirection) move(repeatDirection);
    if (movement.moving) {
      const touched = movement.tick(delta, session.currentEvent.distance);
      if (touched && session.encounter()) renderBattle();
      else if (!movement.moving) session.stopWalking();
    }
  }
  if (jumpElapsed >= 0 && !drawer.open && !resultDialog.open) { jumpElapsed += delta;if (jumpElapsed >= 620) jumpElapsed = -1; }
  const jumpOffset = jumpElapsed < 0 ? 0 : Math.sin(jumpElapsed / 620 * Math.PI) * 100 * scale;
  const scroll = movement.position * scale;
  ctx.fillStyle = '#262533';ctx.fillRect(0, 0, width, height);
  const bgWidth = Math.round(images.bookshelf.width * scale), bgHeight = Math.round(images.bookshelf.height * scale);
  const bgOffset = (scroll * .65 + bgWidth * .78) % bgWidth;
  ctx.save();ctx.beginPath();ctx.rect(0, 0, width, floor);ctx.clip();
  for (let y = floor - bgHeight; y > -bgHeight; y -= bgHeight) for (let x = -bgOffset; x < width; x += bgWidth) ctx.drawImage(images.bookshelf, Math.floor(x), Math.floor(y), bgWidth + 1, bgHeight + 1);
  ctx.restore();
  const tileWidth = Math.round(images.ground.width * scale), tileHeight = Math.round(images.ground.height * scale);
  for (let y = floor; y < height; y += tileHeight) for (let x = -(scroll % tileWidth); x < width; x += tileWidth) ctx.drawImage(images.ground, Math.floor(x), Math.floor(y), tileWidth + 1, tileHeight + 1);
  drawSprite(images.player, config.player, playerPosition(), movement.moving, jumpOffset, movement.direction === -1 ? config.player.leftRow : config.player.row);
  const event = session?.currentEvent;
  if (event) {
    const x = playerPosition() + (event.distance - movement.position + 130) * scale;
    if (event.kind === 'chest') {
      const image = images['chest' + event.variant];const itemWidth = 155 * scale;const itemHeight = itemWidth * image.height / image.width;
      ctx.drawImage(image, Math.round(x - itemWidth / 2), Math.round(floor - itemHeight), itemWidth, itemHeight);
    } else {
      drawSprite(images.enemy, config.enemy, x, false);
      if (event.final) {
        const itemWidth = 58 * scale;const itemHeight = itemWidth * images.diamond.height / images.diamond.width;
        const top = floor - spriteSize() * .68 - itemHeight - 15 * scale;
        ctx.drawImage(images.diamond, Math.round(x - itemWidth / 2), Math.round(top), itemWidth, itemHeight);
      }
    }
  }
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || resultDialog.open || drawer.open || !bank) return;
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
    if (!Number.isFinite(config.questionRatio) || config.questionRatio <= 0 || config.questionRatio > 1) throw new Error('questionRatio 必须大于 0 且不超过 1。');
    let files;try { files = await getJSON('question/index.json'); } catch { files = config.questionFiles; }
    if (!Array.isArray(files) || !files.length) throw new Error('question 文件夹中没有 JSON 题库。');
    const sources = [config.player.src, config.enemy.src, 'assets/Background/bookshelf.png', 'assets/ground/single_block.png', 'assets/ui/upper.png', 'assets/ui/right.png', 'assets/ui/left.png', 'assets/items/chest_1.png', 'assets/items/chest_2.png', 'assets/items/diamond.png'];
    const [banks, loaded] = await Promise.all([Promise.all(files.map(file => getJSON(`question/${encodeURIComponent(file)}`))), Promise.all(sources.map(loadImage))]);

    bank = normalizeQuestions(banks);
    if (bank.length < 2) throw new Error('至少需要 2 道不同题目，才能同时安排怪物和宝箱。');
    images = Object.fromEntries(['player', 'enemy', 'bookshelf', 'ground', 'upper', 'right', 'left', 'chest1', 'chest2', 'diamond'].map((key, index) => [key, loaded[index]]));
    for (const key of ['player', 'enemy']) {
      const def = config[key];
      if (![def.row, def.frames, def.cellSize, def.baseline].every(value => Number.isInteger(value) && value > 0) || def.baseline > def.cellSize || def.row * def.cellSize > images[key].height || def.frames * def.cellSize > images[key].width) throw new Error(`${key} 精灵图配置无效。`);
    }
    renderReady();resizeCanvas();new ResizeObserver(resizeCanvas).observe(canvas);requestAnimationFrame(draw);
  } catch (error) {
    panel.innerHTML = `<div class="error-panel"><p>${escapeHTML(error.message)}</p><button id="retry-button" class="pixel-button">重新加载</button></div>`;
    $('#retry-button').addEventListener('click', () => location.reload());announce(error.message);
  }
}
init();

