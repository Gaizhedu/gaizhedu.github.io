import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJourney, validateRatios } from '../game-core.js';
import { describeBank } from '../question-banks.js';

const bank = Array.from({ length: 80 }, (_, id) => ({ id, difficulty: id < 50 ? 'easy' : id < 70 ? 'normal' : 'hard' }));
const ratios = {
  monster: { ratio: .7, difficulties: ['easy'] },
  chest: { ratio: .2, difficulties: ['easy', 'normal'] },
  headChest: { ratio: .1, difficulties: ['hard'] }
};
test('80 questions at 30 percent split into 17 monsters, 5 road chests and 2 head chests', () => {
  for (let run = 0; run < 20; run++) {
    const events = buildJourney(bank, ratios, Math.random, .3);
    assert.equal(events.length, 24);
    assert.equal(events.filter(e => e.kind === 'monster').length, 17);
    assert.equal(events.filter(e => e.kind === 'chest' && !e.head).length, 5);
    assert.equal(events.filter(e => e.head).length, 2);
    assert.equal(new Set(events.map(e => e.question.id)).size, 24);
    for (const e of events) assert.ok(ratios[e.head ? 'headChest' : e.kind].difficulties.includes(e.question.difficulty));
  }
});
test('total ratio and shares are validated, head share may exceed the other shares', () => {
  for (const total of [0, -1, 1.1, null, '0.3', NaN]) assert.throws(() => validateRatios(ratios, total), /totalQuestionRatio/);
  for (const headChest of [.05, .2]) assert.throws(() => validateRatios({ monster: .7, chest: .2, headChest }, .3), /等于 1/);
  assert.doesNotThrow(() => validateRatios({ monster: .1, chest: .1, headChest: .8 }, .3));
});
test('rounding preserves the budget and mandatory encounters for small banks and skewed shares', () => {
  for (let n = 2; n <= 80; n++) for (const total of [.01, .3, 1]) {
    for (const shares of [{ monster: .7, chest: .2, headChest: .1 }, { monster: .01, chest: .01, headChest: .98 }, { monster: .5, chest: .5, headChest: 0 }]) {
      const events = buildJourney(bank.slice(0, n), shares, () => .5, total);
      assert.equal(events.length, Math.max(2, Math.ceil(n * total)));
      assert.ok(events.some(e => e.kind === 'monster'));
      assert.ok(events.some(e => e.kind === 'chest' && !e.head));
      if (shares.headChest === 0) assert.ok(!events.some(e => e.head));
    }
  }
});
test('catalog carries total ratio through to journey generation and reports invalid shares', () => {
  const questions = bank.map(q => ({ questionDetail: String(q.id), optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', correctOption: 'A', difficulty: q.difficulty }));
  const questionBank = { totalQuestionRatio: .3, encounterRatios: ratios, questions };
  const entry = describeBank({ questionBank }, 'example');
  assert.equal(entry.error, '');
  assert.equal(buildJourney(entry.questions, entry.ratios, Math.random, entry.totalQuestionRatio).length, 24);
  const invalid = describeBank({ questionBank: { ...questionBank, encounterRatios: { monster: .3, chest: .2, headChest: .1 } } }, 'bad');
  assert.match(invalid.error, /等于 1/);
});
