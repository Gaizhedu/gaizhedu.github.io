import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildJourney, normalizeQuestions, validateRatios } from '../game-core.js';
import { describeBank } from '../question-banks.js';

const setting = (ratio, ...difficulties) => ({ ratio, difficulties });
const kind = event => event.head ? 'headChest' : event.kind;
const questions = Array.from({ length: 30 }, (_, id) => ({ id, difficulty: ['easy', 'normal', 'hard'][id % 3] }));

test('each encounter uses only its own difficulty selection without repeats', () => {
  const ratios = { monster: setting(.3, 'easy', 'normal'), chest: setting(.2, 'normal'), headChest: setting(.1, 'hard') };
  for (let run = 0; run < 40; run++) {
    const events = buildJourney(questions, ratios);
    assert.equal(events.length, 18);
    assert.equal(events.filter(event => event.head).length, 3);
    assert.equal(new Set(events.map(event => event.question.id)).size, events.length);
    for (const event of events) assert.ok(ratios[kind(event)].difficulties.includes(event.question.difficulty));
    assert.equal(events.at(-1).kind, 'monster');
    assert.equal(events.at(-1).final, true);
  }
});

test('overlapping pools reassign questions to preserve restrictive encounters', () => {
  const events = buildJourney([{ id: 1, difficulty: 'hard' }, { id: 2, difficulty: 'easy' }], {
    monster: setting(.3, 'easy', 'hard'), chest: setting(.2, 'hard'), headChest: setting(0, 'easy')
  }, () => .99);
  assert.equal(events[0].question.difficulty, 'hard');
  assert.equal(events.at(-1).question.difficulty, 'easy');
});

test('scarce pools reduce counts without using forbidden difficulties', () => {
  const bank = questions.map((question, i) => ({ ...question, difficulty: i < 3 ? 'easy' : 'hard' }));
  const ratios = { monster: setting(.3, 'easy'), chest: setting(.2, 'easy'), headChest: setting(.1, 'normal') };
  const events = buildJourney(bank, ratios);
  assert.equal(events.length, 3);
  assert.ok(events.every(event => event.question.difficulty === 'easy'));
  assert.ok(!events.some(event => event.head));
  assert.throws(() => buildJourney(bank.map(q => ({ ...q, difficulty: 'hard' })), ratios), /difficulties/);
});

test('difficulty validation catches typos and defaults missing question difficulty to easy', () => {
  for (const difficulties of [[], ['expert'], 'easy', null]) {
    assert.throws(() => validateRatios({ monster: { ratio: .3, difficulties }, chest: .2, headChest: .1 }), /difficulties/);
  }
  const raw = { questionDetail: 'Q', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', correctOption: 'A' };
  assert.equal(normalizeQuestions([[raw]])[0].difficulty, 'easy');
  assert.throws(() => normalizeQuestions([[{ ...raw, difficulty: 'expert' }]]), /difficulty/);
  const entry = describeBank({ encounterRatios: { monster: setting(.3, 'hard'), chest: .2, headChest: .1 }, questions: [raw, { ...raw, questionDetail: 'Q2' }] }, 'invalid');
  assert.match(entry.error, /difficulties/);
});

test('all shipped JSON banks respect their configured difficulty and total budget', () => {
  const files = readdirSync(new URL('../question/', import.meta.url)).filter(file => file.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const data = JSON.parse(readFileSync(new URL(`../question/${file}`, import.meta.url), 'utf8'));
    const bank = describeBank(data, file);
    assert.equal(bank.error, '');
    assert.equal(bank.totalQuestionRatio, data.questionBank.totalQuestionRatio);
    assert.ok(bank.totalQuestionRatio > 0 && bank.totalQuestionRatio <= 1);
    for (let run = 0; run < 10; run++) {
      const events = buildJourney(bank.questions, bank.ratios, Math.random, bank.totalQuestionRatio);
      assert.ok(events.every(event => bank.ratios[kind(event)].difficulties.includes(event.question.difficulty)));
      assert.ok(events.length <= Math.ceil(bank.questions.length * bank.totalQuestionRatio));
      assert.equal(new Set(events.map(event => event.question.id)).size, events.length);
    }
  }
});
