import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCap, gameStatus, matchResult } from './scoring.ts';
import type { ScoringRule } from './types.ts';

const r21: ScoringRule = { games: 3, points: 21, cap: 30 };
const r15: ScoringRule = { games: 3, points: 15, cap: 21 };
const one21: ScoringRule = { games: 1, points: 21, cap: 30 };

test('defaultCap: 21→30, 15→21, khác → points+9', () => {
  assert.equal(defaultCap(21), 30);
  assert.equal(defaultCap(15), 21);
  assert.equal(defaultCap(31), 40);
});

test('gameStatus luật 21/30', () => {
  assert.equal(gameStatus([21, 19], r21), 'a');
  assert.equal(gameStatus([22, 20], r21), 'a');
  assert.equal(gameStatus([30, 29], r21), 'a');
  assert.equal(gameStatus([21, 20], r21), 'invalid');
  assert.equal(gameStatus([29, 27], r21), 'a');
  assert.equal(gameStatus([31, 29], r21), 'invalid');
  assert.equal(gameStatus([19, 21], r21), 'b');
});

test('gameStatus luật 15/21 (BWF 3x15)', () => {
  assert.equal(gameStatus([15, 13], r15), 'a');
  assert.equal(gameStatus([21, 20], r15), 'a');
  assert.equal(gameStatus([16, 14], r15), 'a');
  assert.equal(gameStatus([15, 14], r15), 'invalid');
});

test('matchResult 3 set: thắng 2-1, cộng điểm', () => {
  assert.deepEqual(matchResult([[21, 10], [15, 21], [21, 18]], r21),
    { winner: 'a', valid: true, games: [2, 1], points: [57, 49] });
});

test('matchResult 3 set: set thừa sau khi đã thắng 2-0 là không hợp lệ', () => {
  assert.equal(matchResult([[21, 10], [21, 12], [21, 5]], r21).valid, false);
});

test('matchResult chưa xong thì winner null', () => {
  assert.equal(matchResult([[21, 10]], r21).winner, null);
});

test('matchResult 1 set', () => {
  assert.equal(matchResult([[21, 15]], one21).winner, 'a');
  assert.equal(matchResult([[21, 15]], one21).valid, true);
});
