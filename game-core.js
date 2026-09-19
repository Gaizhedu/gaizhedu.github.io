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
      result.push({ id: key, question, options, correct, explanation: String(item.explanation ?? ''), tags: Array.isArray(item.tags) ? item.tags.map(String) : [] });
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
    this.phase = 'explore';
  }
  get current() { return this.questions[this.answers.length]; }
  get currentEvent() { return this.encounters[this.answers.length]; }
  get score() { return Math.round(this.correct / this.questions.length * 100); }
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
    const record = { question: this.current, kind: this.currentEvent.kind, selected: letter, isCorrect: this.current.correct === letter };
    this.answers.push(record);
    this.phase = this.answers.length === this.questions.length ? 'finished' : 'explore';
    return record;
  }
}

export function buildJourney(bank, ratio, random = Math.random) {
  if (bank.length < 2) throw new Error('怪物和宝箱至少需要 2 道不同的题目。');
  const shuffled = sampleQuestions(bank, 1, random);
  let monsters = sampleQuestions(bank, ratio, random).length;
  const chestCount = count => Math.min(bank.length - 1, Math.max(1, Math.ceil(count * .3)) + 1);
  while (monsters + chestCount(monsters) > bank.length) monsters--;
  const chests = chestCount(monsters);
  const events = Array.from({ length: monsters - 1 }, () => ({ kind: 'monster', final: false }));
  const firstSkin = random() < .5 ? 1 : 2;
  for (let i = 0; i < chests; i++) events.push({ kind: 'chest', head: i === chests - 1, variant: (firstSkin + i - 1) % 2 + 1, final: false });
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }
  events.push({ kind: 'monster', final: true });
  return events.map((event, i) => ({ ...event, question: shuffled[i], distance: (i + 1) * 380 }));
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
