export const LETTERS = ['A', 'B', 'C', 'D'];

export function normalizeQuestions(banks) {
  const result = [];
  const seen = new Set();
  for (const bank of banks) {
    const list = Array.isArray(bank) ? bank : bank.questionBank?.questions ?? bank.questions;
    if (!Array.isArray(list)) throw new Error('题库需要包含 questionBank.questions 数组。');
    for (const item of list) {
      if (item.type && item.type !== 'single_choice') continue;
      const question = String(item.questionDetail ?? '').trim();
      const options = LETTERS.map(letter => String(item['option' + letter] ?? '').trim());
      const correct = String(item.correctOption ?? '').toUpperCase().trim();
      if (!question || options.some(option => !option) || !LETTERS.includes(correct)) {
        throw new Error(`题目 ${item.questionId || question || '未命名'} 缺少题干、四个选项或有效答案。`);
      }
      const key = JSON.stringify([question, options]);
      if (seen.has(key)) continue;
      seen.add(key);
      const difficulty = item.difficulty ?? 'easy';
      if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new Error(`题目 ${item.questionId || question} 的 difficulty 必须为 easy、normal 或 hard。`);
      result.push({ id: key, question, options, correct, difficulty, explanation: String(item.explanation ?? ''), tags: Array.isArray(item.tags) ? item.tags.map(String) : [] });
    }
  }
  if (!result.length) throw new Error('题库中没有可用的单选题。');
  return result;
}

export function sampleQuestions(questions, ratio, random = Math.random) {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) throw new Error('抽题比例需要大于 0 且不超过 100%。');
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.ceil(questions.length * ratio));
}

export class GameSession {
  constructor(questions, encounters = null) {
    if (!questions.length) throw new Error('本局没有题目。');
    this.questions = questions;
    this.encounters = encounters ?? questions.map((question, i) => ({ question, kind: 'monster', final: i === questions.length - 1, distance: (i + 1) * 380 }));
    this.answers = [];
    this.eventIndex = 0;
    this.skipped = [];
    this.phase = 'explore';
  }
  get current() { return this.currentEvent?.question; }
  get currentEvent() { return this.encounters[this.eventIndex]; }
  get score() { return this.answers.length ? Math.round(this.correct / this.answers.length * 100) : 0; }
  get roadCompleted() { return this.answers.filter(answer => !answer.head).length; }
  get headOpened() { return this.answers.filter(answer => answer.head).length; }
  skipHeadChest(position) {
    if (!['explore', 'walking'].includes(this.phase) || !this.currentEvent?.head || position <= this.currentEvent.distance + 220) return false;
    this.skipped.push(this.currentEvent);this.eventIndex++;
    this.phase = this.currentEvent ? 'explore' : 'finished';
    return true;
  }
  get correct() { return this.answers.filter(answer => answer.isCorrect).length; }
  get wrong() { return this.answers.length - this.correct; }
  advance() {
    if (this.phase !== 'explore') return false;
    this.phase = 'walking'; return true;
  }
  encounter() {
    if (this.phase !== 'walking') return false;
    this.phase = 'battle'; return true;
  }
  stopWalking() {
    if (this.phase === 'walking') this.phase = 'explore';
  }
  answer(letter) {
    if (this.phase !== 'battle' || !LETTERS.includes(letter)) return null;
    const record = { question: this.current, kind: this.currentEvent.kind, head: Boolean(this.currentEvent.head), selected: letter, isCorrect: this.current.correct === letter };
    this.answers.push(record);
    this.eventIndex++;
    this.phase = this.eventIndex === this.encounters.length ? 'finished' : 'explore';
    return record;
  }
}

export const DEFAULT_RATIOS = Object.freeze({ monster: .3, chest: .2, headChest: .1 });
const ratioValue = value => typeof value === 'number' ? value : value?.ratio;
export function validateRatios(ratios = DEFAULT_RATIOS, totalQuestionRatio) {
  if (totalQuestionRatio !== undefined && (!Number.isFinite(totalQuestionRatio) || totalQuestionRatio <= 0 || totalQuestionRatio > 1))
    throw new Error('totalQuestionRatio 必须大于 0 且不超过 1。');
  const normalized = {};
  for (const kind of ['monster', 'chest', 'headChest']) {
    const value = ratios?.[kind];
    if (value && typeof value === 'object') {
      if (!Array.isArray(value.difficulties) || !value.difficulties.length || !value.difficulties.every(level => ['easy', 'normal', 'hard'].includes(level)))
        throw new Error(`encounterRatios.${kind}.difficulties 需要包含 easy、normal 或 hard 的非空数组。`);
      normalized[kind] = { ratio: value.ratio, difficulties: [...new Set(value.difficulties)] };
    } else normalized[kind] = value;
  }
  const [monster, chest, headChest] = ['monster', 'chest', 'headChest'].map(kind => ratioValue(normalized[kind]));
  if (![monster, chest, headChest].every(value => Number.isFinite(value) && value >= 0 && value <= 1) || monster <= 0 || chest <= 0)
    throw new Error('encounterRatios 需要有效的 monster、chest、headChest 比例，怪物和路上宝箱比例须大于 0。');
  if (totalQuestionRatio !== undefined) {
    if (Math.abs(monster + chest + headChest - 1) > 1e-9) throw new Error('三类题目 ratio 相加必须等于 1。');
  } else {
    if (headChest >= monster || headChest >= chest) throw new Error('顶头宝箱比例必须小于怪物和路上宝箱比例。');
    if (monster + chest + headChest > 1 + 1e-9) throw new Error('三类题目比例之和不能超过 100%。');
  }
  return normalized;
}

export function buildJourney(bank, ratios = DEFAULT_RATIOS, random = Math.random, totalQuestionRatio) {
  if (bank.length < 2) throw new Error('怪物和宝箱至少需要 2 道不同的题目。');
  ratios = validateRatios(ratios, totalQuestionRatio);
  const shuffled = sampleQuestions(bank, 1, random);
  let monsters = Math.ceil(bank.length * ratioValue(ratios.monster));
  let chests = Math.ceil(bank.length * ratioValue(ratios.chest));
  let heads = Math.ceil(bank.length * ratioValue(ratios.headChest));
  // Rounding may exceed a tiny bank: reserve mandatory encounters before bonuses.
  while (monsters + chests + heads > bank.length) {
    if (heads > 0) heads--;
    else if (chests > 1 && chests >= monsters) chests--;
    else if (monsters > 1) monsters--;
    else chests--;
  }
  if (totalQuestionRatio !== undefined) {
    const total = Math.max(2, Math.ceil(bank.length * totalQuestionRatio));
    const shares = ['monster', 'chest', 'headChest'].map(kind => total * ratioValue(ratios[kind]));
    const counts = shares.map(Math.floor);
    const order = [0, 1, 2].sort((a, b) => (shares[b] - counts[b]) - (shares[a] - counts[a]) || a - b);
    const remaining = total - counts.reduce((sum, count) => sum + count, 0);
    for (let i = 0; i < remaining; i++) counts[order[i]]++;
    // Keep the final monster and a road chest even in very small journeys.
    for (const required of [0, 1]) if (counts[required] === 0) {
      const donor = [0, 1, 2].filter(i => counts[i] > (i < 2 ? 1 : 0))
        .sort((a, b) => (counts[b] - shares[b]) - (counts[a] - shares[a]) || a - b)[0];
      counts[donor]--;counts[required]++;
    }
    [monsters, chests, heads] = counts;
  }
  // Reassign earlier matches when needed so broad filters cannot steal the only
  // question available to a more restrictive category. Every question is unique.
  const assigned = new Map();
  const slots = [];
  function match(slot, visited = new Set()) {
    const allowed = ratios[slot.category]?.difficulties;
    for (const question of shuffled) {
      if (visited.has(question) || (allowed && !allowed.includes(question.difficulty ?? 'easy'))) continue;
      visited.add(question);
      const previous = assigned.get(question);
      if (!previous || match(previous, visited)) {
        assigned.set(question, slot);slot.question = question;return true;
      }
    }
    return false;
  }
  function addSlot(category, required = false) {
    const slot = { category };
    if (match(slot)) slots.push(slot);
    else if (required) throw new Error('所选难度下至少需要一道怪物题和一道不同的路上宝箱题，请检查 difficulties 配置。');
  }
  addSlot('monster', true);
  addSlot('chest', true);
  for (let i = 1; i < monsters; i++) addSlot('monster');
  for (let i = 1; i < chests; i++) addSlot('chest');
  for (let i = 0; i < heads; i++) addSlot('headChest');
  const finalMonster = slots.shift();
  const events = slots.map(slot => ({ kind: slot.category === 'monster' ? 'monster' : 'chest', head: slot.category === 'headChest', final: false, question: slot.question }));
  const firstSkin = random() < .5 ? 1 : 2;
  let chestIndex = 0;
  for (const event of events) if (event.kind === 'chest') event.variant = (firstSkin + chestIndex++ - 1) % 2 + 1;
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }
  events.push({ kind: 'monster', final: true, question: finalMonster.question });
  return events.map((event, i) => ({ ...event, distance: (i + 1) * 380 }));
}

export class StepMovement {
  constructor({ step = 48, speed = 220, backtrackLimit = 180 } = {}) {
    this.stepSize = step;this.speed = speed;this.backtrackLimit = backtrackLimit;
    this.position = 0;this.target = 0;this.farthest = 0;this.direction = 1;
  }
  get minimum() { return Math.max(0, this.farthest - this.backtrackLimit); }
  get moving() { return Math.abs(this.target - this.position) > .001; }
  step(direction, stopAt) {
    if (direction !== -1 && direction !== 1) return false;
    this.direction = direction;
    const origin = this.moving && Math.sign(this.target - this.position) === direction ? this.target : this.position;
    this.target = Math.max(this.minimum, Math.min(stopAt, origin + direction * this.stepSize));
    return this.moving;
  }
  tick(milliseconds, stopAt) {
    const difference = this.target - this.position;
    const distance = Math.min(Math.abs(difference), this.speed * milliseconds / 1000);
    this.position = Math.max(this.minimum, Math.min(stopAt, this.position + Math.sign(difference) * distance));
    if (Math.abs(this.target - this.position) < .001) this.position = this.target;
    this.farthest = Math.max(this.farthest, this.position);
    return this.position >= stopAt;
  }
  stop() { this.target = this.position; }
}


export class HeldDirection {
  constructor() { this.clear(); }
  press(source, direction) { this.source = source;this.direction = direction;this.elapsed = 0; }
  release(source) { if (this.source === source) this.clear(); }
  clear() { this.source = null;this.direction = 0;this.elapsed = 0; }
  tick(milliseconds, moving) {
    if (!this.source) return 0;
    this.elapsed += milliseconds;
    return this.elapsed >= 300 && !moving ? this.direction : 0;
  }
}

export class MonsterApproach {
  constructor(position, speed = 95) { this.position = position;this.speed = speed; }
  tick(milliseconds, playerPosition) {
    this.position = Math.max(playerPosition, this.position - this.speed * milliseconds / 1000);
    return this.position <= playerPosition;
  }
}

export class AnswerDelay {
  constructor(delay = 500) { this.delay = delay;this.readyAt = Infinity; }
  start(now) { this.readyAt = now + this.delay; }
  ready(now) { return now >= this.readyAt; }
}
