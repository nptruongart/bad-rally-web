import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerCount, draftTeams, partnerWarnings } from './partners.ts';
import type { MatchRecord } from './matchmaking.ts';

const H: MatchRecord[] = [
  { t1: ['a', 'b'], t2: ['c', 'd'], at: 1 },
  { t1: ['c', 'a'], t2: ['b', 'd'], at: 2 },
  { t1: ['e', 'f'], t2: ['b', 'a'], at: 3 },
];
const P = (id: string, gender: 'M' | 'F' = 'M') => ({ id, gender });

test('đếm số trận 2 người cùng đội (đối đầu không tính)', () => {
  assert.equal(partnerCount(H, 'a', 'b'), 2);
  assert.equal(partnerCount(H, 'b', 'a'), 2);
  assert.equal(partnerCount(H, 'a', 'd'), 0);
  assert.equal(partnerCount(H, 'a', 'c'), 1);
});

test('xếp tay 2v2: 2 người chọn đầu là đội 1, 2 người sau là đội 2', () => {
  assert.deepEqual(draftTeams([P('a'), P('b'), P('c')], '2v2', 'any'), [['a', 'b'], ['c']]);
  assert.deepEqual(draftTeams([P('a'), P('b'), P('c')], '1v2', 'any'), [['a'], ['b', 'c']]);
});

test('xếp tay nam nữ: nam thứ k ghép với nữ thứ k, bất kể thứ tự chọn', () => {
  assert.deepEqual(draftTeams([P('m1'), P('m2'), P('f1', 'F')], '2v2', 'XD'), [['m1', 'f1'], ['m2']]);
  assert.deepEqual(draftTeams([P('f1', 'F'), P('f2', 'F'), P('m1'), P('m2')], '2v2', 'XD'), [['m1', 'f1'], ['m2', 'f2']]);
});

test('cảnh báo các cặp cùng đội đã từng đánh chung, kèm số trận', () => {
  assert.deepEqual(partnerWarnings(H, [['a', 'b'], ['c', 'd']]), [{ a: 'a', b: 'b', count: 2 }, { a: 'c', b: 'd', count: 1 }]);
  assert.deepEqual(partnerWarnings(H, [['a', 'd'], ['e']]), []);
});
