import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, buildJourney, validateRatios } from '../game-core.js';
import { describeBank } from '../question-banks.js';
const bank = Array.from({length: 10}, (_, i) => ({id: i, correct: 'A'}));
const events = [
  {kind:'chest', head:true, distance:380, question:bank[0]},
  {kind:'chest', head:false, distance:760, question:bank[1]},
  {kind:'monster', final:true, distance:1140, question:bank[2]}
];

test('passing a head chest does not answer it or penalize score and still allows completion', () => {
  const game = new GameSession(bank.slice(0,3), events);
  assert.equal(game.skipHeadChest(380), false);
  assert.equal(game.skipHeadChest(600), false);
  game.advance();assert.equal(game.skipHeadChest(601), true);
  assert.equal(game.currentEvent, events[1]);assert.equal(game.answers.length, 0);
  assert.equal(game.skipHeadChest(2000), false);
  for (let i=0;i<2;i++) { game.advance();game.encounter();game.answer('A'); }
  assert.equal(game.phase,'finished');assert.equal(game.score,100);
  assert.equal(game.roadCompleted,2);assert.equal(game.headOpened,0);
  assert.equal(game.skipped.length,1);assert.equal(game.answers.length,2);
});

test('opened optional boxes count separately and cannot be skipped during a question', () => {
  const game = new GameSession(bank.slice(0,3), events);
  game.advance();game.encounter();assert.equal(game.skipHeadChest(900),false);
  game.answer('B');assert.equal(game.headOpened,1);assert.equal(game.roadCompleted,0);
  for (let i=0;i<2;i++) { game.advance();game.encounter();game.answer('A'); }
  assert.equal(game.phase,'finished');assert.equal(game.score,67);
  assert.equal(game.roadCompleted,2);assert.equal(game.headOpened,1);
});

test('each ratio controls its own category and invalid ratios are rejected', () => {
  const journey = buildJourney(bank, {monster:.4, chest:.3, headChest:.1});
  assert.equal(journey.filter(e=>e.kind==='monster').length,4);
  assert.equal(journey.filter(e=>e.kind==='chest'&&!e.head).length,3);
  assert.equal(journey.filter(e=>e.head).length,1);
  assert.equal(new Set(journey.map(e=>e.question.id)).size,8);
  assert.equal(buildJourney(bank,{monster:.5,chest:.4,headChest:0}).some(e=>e.head),false);
  for (const ratios of [null, {}, {monster:.3,chest:.1,headChest:.1}, {monster:.2,chest:.4,headChest:.3}, {monster:.6,chest:.4,headChest:.1}, {monster:.3,chest:.2,headChest:-1}]) assert.throws(()=>validateRatios(ratios));
});

test('JSON metadata supplies ratios and bad metadata disables only that bank', () => {
  const questions = bank.map(q=>({questionDetail:String(q.id),optionA:'a',optionB:'b',optionC:'c',optionD:'d',correctOption:'A'}));
  const ratios={monster:.4,chest:.2,headChest:.05};
  const entry=describeBank({questionBank:{title:'custom',encounterRatios:ratios,questions}},'x');
  assert.deepEqual(entry.ratios,ratios);assert.equal(entry.error,'');
  assert.ok(describeBank({questionBank:{encounterRatios:{...ratios,headChest:.4},questions}},'x').error);
});
