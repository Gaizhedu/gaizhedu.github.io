import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeQuestions, buildJourney, StepMovement, GameSession } from '../game-core.js';
import { loadHistory, addResult, saveHistory, HISTORY_KEY } from '../history.js';
const bank = normalizeQuestions([JSON.parse(await readFile(new URL('../question/09_17.json', import.meta.url), 'utf8'))]);

test('default journey adds ordinary and head chest questions to three monster questions', () => {
  for (let i = 0; i < 100; i++) {
    const events = buildJourney(bank);
    assert.equal(events.filter(e => e.kind === 'monster').length, 3);
    assert.equal(events.filter(e => e.kind === 'chest').length, 3);
    assert.equal(new Set(events.map(e => e.question.id)).size, 6);
    assert.equal(events.at(-1).kind, 'monster');
    assert.equal(events.at(-1).final, true);
    assert.equal(events.filter(e => e.final).length, 1);
  }
});
test('capacity limits reserve chest questions without duplicates at all ratios', () => {
  for (const ratio of [.1, .3, .5, .7]) {
    const events = buildJourney(bank, {monster: ratio, chest: .2, headChest: .05});
    const monsters = events.filter(e => e.kind === 'monster').length;
    assert.equal(events.filter(e => e.kind === 'chest').length, 3);
    assert.equal(new Set(events.map(e => e.question.id)).size, events.length);
    assert.ok(events.length <= bank.length);
  }
  assert.equal(buildJourney(bank.slice(0, 2)).length, 2);
  assert.throws(() => buildJourney(bank.slice(0, 1)));
});
test('single tap moves exactly one step and stays stopped until another input', () => {
  const movement = new StepMovement();
  movement.step(1, 380);
  movement.tick(1000, 380);
  assert.equal(movement.position, 48);
  assert.equal(movement.moving, false);
  movement.tick(20000, 380);
  assert.equal(movement.position, 48);
});
test('queued forward steps clamp at encounter and backward movement has a rolling limit', () => {
  const movement = new StepMovement();
  for (let i = 0; i < 20; i++) movement.step(1, 380);
  assert.equal(movement.tick(5000, 380), true);
  assert.equal(movement.position, 380);
  for (let i = 0; i < 50; i++) { movement.step(-1, 760);movement.tick(1000, 760); }
  assert.equal(movement.position, 200);
  assert.equal(movement.direction, -1);
  for (let i = 0; i < 20; i++) movement.step(1, 760);
  movement.tick(5000, 760);
  assert.equal(movement.position, 760);
  for (let i = 0; i < 50; i++) { movement.step(-1, 1140);movement.tick(1000, 1140); }
  assert.equal(movement.position, 580);
});
test('initial left boundary and cancellation do not drift', () => {
  const movement = new StepMovement();
  assert.equal(movement.step(-1, 380), false);
  movement.tick(1000, 380);assert.equal(movement.position, 0);
  movement.step(1, 380);movement.tick(100, 380);movement.stop();
  const paused = movement.position;movement.tick(1000, 380);
  assert.equal(movement.position, paused);
});
test('monster and chest answers share scoring and finish only after all encounters', () => {
  const events = buildJourney(bank);
  const game = new GameSession(events.map(e => e.question), events);
  for (let i = 0; i < events.length; i++) {
    game.advance();game.stopWalking();assert.equal(game.phase, 'explore');
    game.advance();game.encounter();
    game.answer(i === 0 ? (game.current.correct === 'A' ? 'B' : 'A') : game.current.correct);
    assert.equal(game.phase, i === events.length - 1 ? 'finished' : 'explore');
  }
  assert.equal(game.correct, 5);assert.equal(game.score, 83);
  assert.equal(game.answers.filter(e => e.kind === 'chest').length, 3);
});
test('history survives storage roundtrip, deduplicates runs, and keeps 20 latest with lifetime count', () => {
  const values = new Map();const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
  let history = loadHistory(storage);
  for (let i = 0; i < 25; i++) history = addResult(history, { id: String(i), correct: 3, total: 4, at: i });
  history = addResult(history, { id: '24', correct: 3, total: 4, at: 24 });
  assert.equal(history.totalRuns, 25);assert.equal(history.records.length, 20);
  assert.equal(saveHistory(storage, history), true);
  const restored = loadHistory(storage);
  assert.equal(restored.totalRuns, 25);assert.equal(restored.records[0].id, '24');assert.equal(restored.records[0].score, 75);
  values.set(HISTORY_KEY, '{invalid');assert.deepEqual(loadHistory(storage), { totalRuns: 0, records: [] });
  assert.equal(saveHistory({ setItem() { throw new Error('blocked'); } }, history), false);
});

test('real animation frame increments snap exactly to the encounter boundary', () => {
  const movement = new StepMovement();
  for (let i = 0; i < 8; i++) movement.step(1, 380);
  let touched = false;
  for (let i = 0; i < 200 && movement.moving; i++) touched = movement.tick(16.6666666667, 380);
  assert.equal(movement.position, 380);assert.equal(touched, true);
});

test('holding repeats after its delay; release, blur and encounter clear the hold', async () => {
  const { HeldDirection } = await import('../game-core.js');
  const input = new HeldDirection();
  input.press('pointer:1', 1);
  assert.equal(input.tick(200, false), 0);
  assert.equal(input.tick(150, true), 0);
  assert.equal(input.tick(16, false), 1);
  input.release('key:ArrowRight');assert.equal(input.tick(16, false), 1);
  input.release('pointer:1');assert.equal(input.tick(500, false), 0);
  input.press('key:ArrowLeft', -1);assert.equal(input.tick(350, false), -1);
  input.clear();assert.equal(input.tick(1000, false), 0);
});

test('monsters approach continuously, meet moving or idle players, and never cross them', async () => {
  const { MonsterApproach } = await import('../game-core.js');
  const monster = new MonsterApproach(900);
  assert.equal(monster.tick(100, 0), false);
  assert.equal(monster.position, 890.5);
  const movement = new StepMovement();
  let met = false;
  for (let i = 0; i < 1000 && !met; i++) {
    if (!movement.moving) movement.step(1, monster.position);
    movement.tick(16, monster.position);
    met = monster.tick(16, movement.position);
    assert.ok(monster.position >= movement.position);
  }
  assert.equal(met, true);
  assert.equal(monster.position, movement.position);
  const idle = new MonsterApproach(380);
  assert.equal(idle.tick(5000, 0), true);
  assert.equal(idle.position, 0);
});

test('every question rejects answers before 500ms and unlocks at exactly 500ms', async () => {
  const { AnswerDelay } = await import('../game-core.js');
  const delay = new AnswerDelay();
  assert.equal(delay.ready(10000), false);
  for (const start of [100, 2000, 3500]) {
    delay.start(start);
    for (const offset of [0, 1, 100, 499, 499.99]) assert.equal(delay.ready(start + offset), false);
    assert.equal(delay.ready(start + 500), true);
  }
});

test('travel follows the real monster instead of blocking at its scheduled spawn', () => {
  const question = {correct:'A'};
  const session = new GameSession([question]);
  const movement = new StepMovement();
  for (let i = 0; i < 20; i++) movement.step(1, session.travelLimit(900));
  movement.tick(3000, session.travelLimit(900));
  assert.ok(movement.position > session.currentEvent.distance);
  assert.equal(session.travelLimit(700), 700);
  assert.equal(session.travelLimit(), 380);
  const optional = new GameSession([question, question], [
    {kind:'chest', head:true, distance:380, question},
    {kind:'chest', distance:760, question}
  ]);
  assert.equal(optional.travelLimit(), 760);
});
