import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, shuffleOptions, GameSession } from '../game-core.js';

test('all 24 option orders preserve each answer identity and the original bank', () => {
  for (const correct of LETTERS) {
    const question = Object.freeze({id:'stable-id', options:Object.freeze(['one', '<strong>two</strong>', 'three', 'four']), correct, explanation:'Original explanation'});
    const orders = new Set();
    for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
      const draws = [a / 4, b / 3, c / 2];
      const shuffled = shuffleOptions(question, () => draws.shift());
      orders.add(JSON.stringify(shuffled.options));
      assert.equal(shuffled.options[LETTERS.indexOf(shuffled.correct)], question.options[LETTERS.indexOf(correct)]);
      assert.deepEqual([...shuffled.options].sort(), [...question.options].sort());
      assert.equal(shuffled.id, question.id);
      assert.equal(shuffled.explanation, question.explanation);
      assert.notEqual(shuffled.options, question.options);
    }
    assert.equal(orders.size, 24);
    assert.deepEqual(question.options, ['one', '<strong>two</strong>', 'three', 'four']);
  }
});

test('shuffled answers score correctly and review retains the displayed order across replays', () => {
  const original = {id:'question', options:['one', 'two', 'three', 'four'], correct:'A'};
  const shuffled = shuffleOptions(original, () => 0);
  assert.equal(shuffled.correct, 'D');
  for (const kind of ['monster', 'chest', 'head']) {
    for (const letter of LETTERS) {
      const events = [{question:shuffled, kind:kind === 'monster' ? 'monster' : 'chest', head:kind === 'head'}];
      const game = new GameSession([shuffled], events);
      game.advance();game.encounter();
      const record = game.answer(letter);
      assert.equal(record.isCorrect, letter === 'D');
      assert.equal(game.score, letter === 'D' ? 100 : 0);
      assert.equal(record.question, shuffled);
      assert.equal(game.answer(letter), null);
      const replay = shuffleOptions(original, () => .999);
      assert.deepEqual(replay.options, original.options);
      assert.deepEqual(record.question.options, ['two', 'three', 'four', 'one']);
    }
  }
});

test('duplicate option text does not confuse the correct original option', () => {
  const question = {options:['same', 'same', 'other', 'last'], correct:'B'};
  assert.equal(shuffleOptions(question, () => 0).correct, 'A');
});
