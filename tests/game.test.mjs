import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameSession, normalizeQuestions, sampleQuestions } from '../game-core.js';

const raw = JSON.parse(await readFile(new URL('../question/09_17.json', import.meta.url), 'utf8'));
const bank = normalizeQuestions([raw]);

test('real bank loads and duplicate banks do not duplicate questions', () => {
  assert.equal(bank.length, 10);
  assert.equal(normalizeQuestions([raw, raw]).length, 10);
});
test('sampling uses ceil, respects ratio, never repeats, and does not mutate bank', () => {
  const initial = bank.map(q => q.id);
  for (const ratio of [.01, .3, .31, 1]) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const sampled = sampleQuestions(bank, ratio);
      assert.equal(sampled.length, Math.ceil(bank.length * ratio));
      assert.equal(new Set(sampled.map(q => q.id)).size, sampled.length);
    }
  }
  assert.deepEqual(bank.map(q => q.id), initial);
  for (const ratio of [0, -1, 1.1, NaN, '0.3']) assert.throws(() => sampleQuestions(bank, ratio));
});
test('one question per enemy, both outcomes continue, double submission is ignored', () => {
  const game = new GameSession(bank.slice(0, 3));
  assert.equal(game.answer('A'), null);
  for (let i = 0; i < 3; i++) {
    assert.equal(game.advance(), true);
    assert.equal(game.advance(), false);
    assert.equal(game.answer('A'), null);
    assert.equal(game.encounter(), true);
    const answer = i === 1 ? (game.current.correct === 'A' ? 'B' : 'A') : game.current.correct;
    assert.ok(game.answer(answer));
    assert.equal(game.answer(answer), null);
    assert.equal(game.answers.length, i + 1);
    assert.equal(game.phase, i === 2 ? 'finished' : 'explore');
  }
  assert.equal(game.correct, 2);assert.equal(game.wrong, 1);
  assert.equal(game.advance(), false);
  assert.equal(new GameSession(sampleQuestions(bank, .3)).answers.length, 0);
});
test('answer records advance the session while the UI controls feedback dismissal', () => {
  const game = new GameSession(bank.slice(0, 2));
  game.advance();game.encounter();
  game.answer(game.current.correct);
  assert.equal(game.phase, 'explore');
  assert.equal(game.advance(), true);
  assert.equal(game.answer('A'), null);
  game.encounter();
  game.answer(game.current.correct === 'A' ? 'B' : 'A');
  assert.equal(game.phase, 'finished');
  assert.equal(game.correct, 1);
  assert.equal(game.wrong, 1);
  assert.equal(game.advance(), false);
});
test('invalid and empty question banks produce actionable errors', () => {
  assert.throws(() => normalizeQuestions([{ questions: [] }]));
  assert.throws(() => normalizeQuestions([{ questions: [{ questionDetail: 'missing options' }] }]));
  assert.throws(() => normalizeQuestions([{}]));
  assert.throws(() => new GameSession([]));
});
