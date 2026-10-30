import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPodium, tournamentStats } from './summary.ts';
import type { Entry, TEvent, TMatch } from './store.ts';

const rule = { games: 1 as const, points: 21, cap: 30 };
const ev = (format: TEvent['format'], over: Partial<TEvent> = {}): TEvent => ({ id: 'ev', tournament: 't', name: 'Đôi nam', category: 'MD', maxEntries: 12, format, groups: 2, advance: 2, scoring: rule, stage: 'ko', order: 0, ...over });
const E = (id: string, group = 'A'): Entry => ({ id, event: 'ev', p1: id + 'x', p2: id + 'y', status: 'approved', seed: 0, group, paid: false, createdBy: '' });
const M = (id: string, o: Partial<TMatch>): TMatch => ({
  id, event: 'ev', stage: 'group', group: 'A', round: 1, order: 0, entryA: '', entryB: '', feeds: null, status: 'done', court: 0,
  scores: [[21, 10]], winner: 'a', calledAt: 0, finishedAt: 0, log: [], version: 1, ...o,
});

test('nhánh đấu: vô địch = thắng chung kết, á quân = thua chung kết, đồng hạng 3 = 2 đôi thua bán kết', () => {
  const ms = [
    M('sf1', { stage: 'ko', group: '', round: 1, entryA: 'a1', entryB: 'b2', winner: 'a' }),
    M('sf2', { stage: 'ko', group: '', round: 1, order: 1, entryA: 'b1', entryB: 'a2', winner: 'b' }),
    M('f', { stage: 'ko', group: '', round: 2, entryA: 'a1', entryB: 'a2', winner: 'b', scores: [[15, 21]] }),
  ];
  const p = eventPodium(ev('groups_ko'), [], ms, 'walkover');
  assert.equal(p.complete, true);
  assert.deepEqual(p.places, [{ place: 1, entries: ['a2'] }, { place: 2, entries: ['a1'] }, { place: 3, entries: ['b2', 'b1'] }]);
});

test('nhánh chưa đánh xong chung kết: chưa có bục, đếm số trận còn lại', () => {
  const ms = [
    M('sf1', { stage: 'ko', group: '', round: 1, entryA: 'a1', entryB: 'b2' }),
    M('f', { stage: 'ko', group: '', round: 2, entryA: 'a1', entryB: '', status: 'pending', scores: [], winner: '' }),
  ];
  const p = eventPodium(ev('groups_ko'), [], ms, 'walkover');
  assert.equal(p.complete, false);
  assert.equal(p.left, 1);
  assert.deepEqual(p.places, []);
});

test('vòng tròn: 3 hạng đầu theo bảng xếp hạng', () => {
  const es = ['e1', 'e2', 'e3', 'e4'].map(id => E(id));
  const ms = [
    M('1', { entryA: 'e1', entryB: 'e2' }), M('2', { entryA: 'e1', entryB: 'e3' }), M('3', { entryA: 'e1', entryB: 'e4' }),
    M('4', { entryA: 'e2', entryB: 'e3' }), M('5', { entryA: 'e2', entryB: 'e4' }), M('6', { entryA: 'e3', entryB: 'e4' }),
  ];
  const p = eventPodium(ev('rr', { groups: 1, advance: 0 }), es, ms, 'walkover');
  assert.deepEqual(p.places, [{ place: 1, entries: ['e1'] }, { place: 2, entries: ['e2'] }, { place: 3, entries: ['e3'] }]);
});

test('đồng đội xoay cặp: thứ hạng bảng + 3 cá nhân điểm cao nhất', () => {
  const es = [E('a12', 'A'), E('b12', 'B')];
  const ms = [M('1', { group: '', entryA: 'a12', entryB: 'b12', scores: [[21, 18]] })];
  const p = eventPodium(ev('team_rot', { groups: 2 }), es, ms, 'walkover');
  assert.equal(p.complete, true);
  assert.deepEqual(p.teams?.map(t => [t.team, t.pointsFor]), [['A', 21], ['B', 18]]);
  assert.equal(p.people?.length, 3);
  assert.deepEqual(p.people?.map(x => [x.team, x.pointsFor]), [['A', 21], ['A', 21], ['B', 18]]);
});

test('số liệu giải: số trận xong / xử thắng / tổng, giờ bắt đầu và kết thúc', () => {
  const ms = [
    M('1', { calledAt: 1000, finishedAt: 2000 }),
    M('2', { calledAt: 1500, finishedAt: 5000, status: 'walkover', scores: [] }),
    M('3', { status: 'pending', scores: [], winner: '', finishedAt: 0 }),
  ];
  assert.deepEqual(tournamentStats(ms), { total: 3, done: 2, walkover: 1, start: 1000, end: 5000 });
});
