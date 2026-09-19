import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain, Jumper, hitsHeadChest, AnswerEffect } from '../world.js';
import { buildJourney, GameSession } from '../game-core.js';

test('walls block travel until a jump clears them; descending lands on solid terrain', () => {
  const terrain = new Terrain();
  const jumper = new Jumper();
  assert.ok(terrain.limit(240, 280, 0) < 256);
  assert.equal(jumper.jump(), true);assert.equal(jumper.jump(), false);
  for (let i = 0; i < 12; i++) jumper.tick(16, 0);
  assert.ok(jumper.feet > 64);
  assert.equal(terrain.limit(240, 280, jumper.feet), 280);
  for (let i = 0; i < 100; i++) jumper.tick(16, 64);
  assert.equal(jumper.feet, 64);assert.equal(jumper.grounded, true);
  for (let i = 0; i < 100; i++) jumper.tick(16, 0);
  assert.equal(jumper.feet, 0);
  assert.ok(new Set(Array.from({length: 32}, (_, i) => terrain.heightAt(i * 64))).size >= 3);
});

test('head chest triggers only when aligned and crossing its bottom while rising', () => {
  const hit = {playerX: 380, chestX: 380, previousHead: 300, head: 320, bottom: 310, rising: true};
  assert.equal(hitsHeadChest(hit), true);
  assert.equal(hitsHeadChest({...hit, rising: false}), false);
  assert.equal(hitsHeadChest({...hit, playerX: 200}), false);
  assert.equal(hitsHeadChest({...hit, previousHead: 290, head: 300}), false);
  assert.equal(hitsHeadChest({...hit, previousHead: 320}), false);
});

test('small banks remain playable and default bank includes both chest types without repeats', () => {
  const bank = Array.from({length: 10}, (_, i) => ({id: i, correct: 'A'}));
  for (let n = 2; n <= 10; n++) {
    const events = buildJourney(bank.slice(0, n));
    assert.ok(events.length <= n);
    assert.equal(new Set(events.map(e => e.question.id)).size, events.length);
    assert.equal(events.filter(e => e.head).length, n === 2 ? 0 : 1);
    assert.equal(events.at(-1).final, true);
  }
  const events = buildJourney(bank);
  assert.ok(events.some(e => e.kind === 'chest' && !e.head));
});

test('final enemy remains available throughout the effect after session finishes', () => {
  const question = {correct: 'A'};
  const session = new GameSession([question]);session.advance();session.encounter();
  const effect = new AnswerEffect(session.currentEvent, 380, 64);
  session.answer('A');assert.equal(session.phase, 'finished');
  assert.equal(effect.event.kind, 'monster');
  assert.equal(effect.tick(500), false);assert.equal(effect.done, false);
  assert.equal(effect.tick(220), true);assert.equal(effect.progress, 1);
  assert.equal(session.answer('A'), null);
});

test('a monster can hop across every platform edge without getting trapped', () => {
  const terrain = new Terrain();
  let position = 1800;
  const body = new Jumper(terrain.heightAt(position));
  for (let i = 0; i < 5000 && position > 130; i++) {
    body.tick(16, terrain.heightAt(position));
    if (terrain.heightAt(position - 8) > body.feet) body.jump();
    position = terrain.limit(position, Math.max(130, position - 95 * .016), body.feet);
  }
  assert.equal(position, 130);
});
