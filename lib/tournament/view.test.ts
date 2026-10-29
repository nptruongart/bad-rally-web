import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryLabel, groupStandings, koRoundName } from './view.ts';
import type { Entry, Participant, TEvent, TMatch } from './store.ts';

const P = (id: string, name: string): Participant => ({ id, tournament: 't', name, gender: 'M', skill: '', users: [] });
const E = (id: string, p1: string, p2: string, group = 'A'): Entry => ({ id, event: 'ev', p1, p2, status: 'approved', seed: 0, group, paid: false, createdBy: '' });
const M = (id: string, a: string, b: string, over: Partial<TMatch> = {}): TMatch => ({
  id, event: 'ev', stage: 'group', group: 'A', round: 1, order: 0, entryA: a, entryB: b, feeds: null, status: 'done', court: 0,
  scores: [[21, 10]], winner: 'a', calledAt: 0, finishedAt: 1, log: [], version: 0, ...over,
});
const ev: TEvent = { id: 'ev', tournament: 't', name: 'Đôi nam', category: 'MD', maxEntries: 12, format: 'groups_ko', groups: 2, advance: 2, scoring: { games: 1, points: 21, cap: 30 }, stage: 'groups', order: 0 };

test('koRoundName theo số vòng còn lại', () => {
  assert.equal(koRoundName(3, 3), 'Chung kết');
  assert.equal(koRoundName(2, 3), 'Bán kết');
  assert.equal(koRoundName(1, 3), 'Tứ kết');
  assert.equal(koRoundName(1, 1), 'Chung kết');
});

test('entryLabel ghép tên 2 người', () => {
  assert.equal(entryLabel(E('e1', 'a', 'b'), [P('a', 'Nam'), P('b', 'Hùng')]), 'Nam – Hùng');
});

test('groupStandings mặc định bốc thăm ổn định: gọi nhiều lần cho cùng thứ tự', () => {
  const entries = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id, i) => E(id, `p${i}a`, `p${i}b`));
  const first = groupStandings(ev, 'A', entries, []).map(r => r.entry).join();
  for (let i = 0; i < 20; i++) assert.equal(groupStandings(ev, 'A', entries, []).map(r => r.entry).join(), first);
});

test('groupStandings chỉ tính trận đã xong của đúng bảng; đôi bỏ cuộc: walkover giữ, BWF loại', () => {
  const entries = [E('e1', 'a', 'b'), E('e2', 'c', 'd'), E('e3', 'e', 'f'), { ...E('e4', 'g', 'h'), status: 'withdrawn' as const }, E('e5', 'i', 'j', 'B')];
  const matches = [
    M('m1', 'e1', 'e2'), M('m2', 'e2', 'e3'), M('m3', 'e1', 'e3', { status: 'playing', winner: '', scores: [] }),
    M('m4', 'e5', 'e1', { group: 'B' }),
  ];
  const rows = groupStandings(ev, 'A', entries, matches, 'walkover', () => 0.5);
  assert.deepEqual(rows.map(r => r.entry), ['e1', 'e2', 'e4', 'e3']); // e4 chưa đánh (HS 0) trên e3 đã thua (HS âm)
  assert.equal(rows[0].played, 1);
  assert.deepEqual(groupStandings(ev, 'A', entries, matches, 'bwf', () => 0.5).map(r => r.entry), ['e1', 'e2', 'e3']);
});
