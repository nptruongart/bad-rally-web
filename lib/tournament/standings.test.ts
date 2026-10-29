import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings } from './standings.ts';
import type { GameScore, ResultInput, ScoringRule } from './types.ts';

const r3: ScoringRule = { games: 3, points: 21, cap: 30 };
const r1: ScoringRule = { games: 1, points: 21, cap: 30 };
const W: GameScore = [21, 10], L: GameScore = [10, 21];
// a thắng b với các set cho trước (điểm tính từ phía a)
const res = (a: string, b: string, scores: GameScore[], winner: 'a' | 'b' = 'a'): ResultInput => ({ a, b, scores, winner });
const opts = (rng: () => number = Math.random) => ({ walkoverMode: 'walkover' as const, withdrawn: [], rng });
const order = (rows: { entry: string }[]) => rows.map(r => r.entry).join('');

test('không hòa: xếp theo số trận thắng', () => {
  const rows = computeStandings(['C', 'B', 'A'], [res('A', 'B', [W, W]), res('A', 'C', [W, W]), res('B', 'C', [W, W])], r3, opts());
  assert.equal(order(rows), 'ABC');
  assert.deepEqual(rows.map(r => r.rank), [1, 2, 3]);
});

test('hai đôi bằng số thắng: đôi thắng đối đầu xếp trên dù hiệu số set kém hơn', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], [
    res('A', 'B', [W, L, W]), res('A', 'C', [W, L, W]), res('D', 'A', [W, W]),
    res('B', 'C', [W, W]), res('B', 'D', [W, W]), res('C', 'D', [W, W]),
  ], r3, opts());
  assert.equal(order(rows), 'ABCD');
  assert.equal(rows.find(r => r.entry === 'B')!.gameDiff, 3);
  assert.equal(rows.find(r => r.entry === 'A')!.gameDiff, 0);
});

test('ba đôi bằng số thắng: xếp theo hiệu số set toàn bảng', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], [
    res('A', 'B', [W, W]), res('B', 'C', [W, L, W]), res('C', 'A', [W, L, W]),
    res('A', 'D', [W, W]), res('B', 'D', [W, W]), res('C', 'D', [W, W]),
  ], r3, opts());
  assert.equal(order(rows), 'ACBD');
});

test('ba đôi bằng hiệu số set: hiệu số điểm, còn hai đôi bằng thì xét đối đầu', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], [
    res('A', 'B', [[21, 10]]), res('B', 'C', [[21, 13]]), res('C', 'A', [[21, 15]]),
    res('A', 'D', [[21, 0]]), res('B', 'D', [[21, 0]]), res('C', 'D', [[21, 1]]),
  ], r1, opts());
  assert.equal(order(rows), 'ABCD');
  assert.equal(rows[1].pointDiff, rows[2].pointDiff);
  assert.equal(rows[1].byLot, false);
});

test('ba đôi bằng hết: bốc thăm theo rng, đánh dấu byLot', () => {
  const seq = [0.9, 0.1, 0.5];
  let i = 0;
  const rows = computeStandings(['A', 'B', 'C', 'D'], [
    res('A', 'B', [W]), res('B', 'C', [W]), res('C', 'A', [W]),
    res('A', 'D', [[21, 0]]), res('B', 'D', [[21, 0]]), res('C', 'D', [[21, 0]]),
  ], r1, opts(() => seq[i++]));
  assert.equal(order(rows), 'BCAD');
  assert.deepEqual(rows.map(r => r.byLot), [true, true, true, false]);
});

test('hai đôi bằng số thắng nhưng chưa gặp nhau (bảng đang đấu): xét hiệu số set rồi điểm, không bốc thăm', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], [res('A', 'C', [[21, 13]]), res('B', 'D', [[21, 14]])], r1, opts(() => { throw new Error('không được bốc thăm'); }));
  assert.equal(order(rows), 'ABDC');
  assert.equal(rows.some(r => r.byLot), false);
});

test('walkover tính 2-0 set, mỗi set đủ điểm thắng', () => {
  const rows = computeStandings(['A', 'B'], [{ a: 'A', b: 'B', scores: [], winner: 'a', walkover: true }], r3, opts());
  const a = rows.find(r => r.entry === 'A')!;
  assert.equal(a.won, 1);
  assert.equal(a.gameDiff, 2);
  assert.equal(a.pointDiff, 42);
});

test('luật BWF: đôi bỏ cuộc bị xóa mọi kết quả', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], [
    res('A', 'D', [W, W]), res('B', 'C', [W, W]), res('A', 'B', [W, W]), res('C', 'A', [W, W]),
  ], r3, { walkoverMode: 'bwf', withdrawn: ['D'], rng: Math.random });
  assert.equal(rows.some(r => r.entry === 'D'), false);
  assert.equal(rows.find(r => r.entry === 'A')!.played, 2);
});
