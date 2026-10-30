import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotationPairs, teamRotSchedule, teamRotTeamStandings, teamRotPersonStandings, teamRotRounds } from './teamrot.ts';
import type { Entry, TMatch } from './store.ts';

const K = 'ABCD';
// Lịch theo ảnh của BTC: "A1A2-B1B2 | C1C2-D1D2" (mã người 1-based)
const fmt = (s: { teamA: number; teamB: number; pair: number }, size: number) => {
  const [x, y] = rotationPairs(size)[s.pair];
  const t = (k: number) => `${K[k]}${x + 1}${K[k]}${y + 1}`;
  return `${t(s.teamA)}-${t(s.teamB)}`;
};

test('rotationPairs 5 người: (1,2) (3,4) (5,1) (2,3) (4,5)', () => {
  assert.deepEqual(rotationPairs(5), [[0, 1], [2, 3], [4, 0], [1, 2], [3, 4]]);
});

test('5–7 người: mỗi người ở đúng 2 cặp, không ai đánh 2 lượt liền nhau (kể cả nối sang vòng sau)', () => {
  for (const size of [5, 6, 7]) {
    const ps = rotationPairs(size);
    assert.equal(ps.length, size);
    for (let i = 0; i < size; i++) assert.equal(ps.filter(p => p.includes(i)).length, 2);
    for (let r = 0; r < size; r++) {
      const [a, b] = ps[r], next = ps[(r + 1) % size];
      assert.ok(!next.includes(a) && !next.includes(b), `${size} người: lượt ${r + 1} và ${r + 2} trùng người`);
    }
  }
});

test('5 người: giữa 2 trận mỗi người nghỉ 1–2 lượt', () => {
  const s = teamRotSchedule({ teams: 4, size: 5, perPerson: 4 }).filter(x => x.teamA === 0);
  for (let p = 0; p < 5; p++) {
    const rounds = s.filter(x => rotationPairs(5)[x.pair].includes(p)).map(x => x.round);
    for (let i = 1; i < rounds.length; i++) assert.ok([2, 3].includes(rounds[i] - rounds[i - 1]), `A${p + 1}: ${rounds}`);
  }
});

test('teamRotRounds: 5 người × 4 trận mỗi người = 10 lượt', () => {
  assert.equal(teamRotRounds(5, 4), 10);
  assert.equal(teamRotRounds(4, 4), 8);
});

test('4 đội × 5 người, 4 trận mỗi người: khớp đúng bảng lượt trận của BTC', () => {
  const s = teamRotSchedule({ teams: 4, size: 5, perPerson: 4 });
  const rounds = Array.from({ length: 10 }, (_, r) => s.filter(x => x.round === r + 1).sort((a, b) => a.order - b.order).map(x => fmt(x, 5)));
  assert.deepEqual(rounds, [
    ['A1A2-B1B2', 'C1C2-D1D2'],
    ['A3A4-B3B4', 'C3C4-D3D4'],
    ['A5A1-B5B1', 'C5C1-D5D1'],
    ['A2A3-C2C3', 'B2B3-D2D3'],
    ['A4A5-C4C5', 'B4B5-D4D5'],
    ['A1A2-C1C2', 'B1B2-D1D2'],
    ['A3A4-D3D4', 'B3B4-C3C4'],
    ['A5A1-D5D1', 'B5B1-C5C1'],
    ['A2A3-D2D3', 'B2B3-C2C3'],
    ['A4A5-B4B5', 'C4C5-D4D5'],
  ]);
});

test('mỗi người đánh đúng số trận đặt ra, không ai đánh 2 trận trong cùng lượt', () => {
  for (const [teams, size, per] of [[4, 5, 4], [2, 6, 4], [4, 6, 2], [4, 5, 2], [2, 7, 4]] as const) {
    const s = teamRotSchedule({ teams, size, perPerson: per });
    const count = new Map<string, number>();
    for (let r = 1; r <= teamRotRounds(size, per); r++) {
      const seen = new Set<string>();
      for (const m of s.filter(x => x.round === r)) {
        for (const t of [m.teamA, m.teamB]) for (const p of rotationPairs(size)[m.pair]) {
          const k = `${t}:${p}`;
          assert.ok(!seen.has(k), `${k} đánh 2 trận ở lượt ${r}`);
          seen.add(k);
          count.set(k, (count.get(k) || 0) + 1);
        }
      }
    }
    assert.equal(count.size, teams * size);
    for (const v of count.values()) assert.equal(v, per);
  }
});

// 2 đội × 4 người; mỗi cặp là một entry (group = đội)
const E = (id: string, group: string, p1: string, p2: string): Entry => ({ id, event: 'ev', p1, p2, status: 'approved', seed: 0, group, paid: false, createdBy: '' });
const M = (id: string, a: string, b: string, scores: [number, number][]): TMatch => ({
  id, event: 'ev', stage: 'group', group: '', round: 1, order: 0, entryA: a, entryB: b, feeds: null, status: 'done', court: 0,
  scores, winner: scores[0][0] > scores[0][1] ? 'a' : 'b', calledAt: 0, finishedAt: 1, log: [], version: 1,
});
const entries = [E('a12', 'A', 'a1', 'a2'), E('a34', 'A', 'a3', 'a4'), E('b12', 'B', 'b1', 'b2'), E('b34', 'B', 'b3', 'b4')];
const matches = [M('m1', 'a12', 'b12', [[21, 15]]), M('m2', 'a34', 'b34', [[18, 21]]), { ...M('m3', 'a12', 'b34', [[0, 0]]), status: 'pending' as const, scores: [], winner: '' as const }];

test('xếp hạng đội: thắng 1 trận +1 điểm; bằng điểm xét hiệu số (trận chưa đánh không tính)', () => {
  const rows = teamRotTeamStandings(['A', 'B'], entries, matches);
  assert.deepEqual(rows.map(r => [r.team, r.played, r.won, r.pointsFor, r.pointsAgainst, r.rank]), [
    ['A', 2, 1, 39, 36, 1],
    ['B', 2, 1, 36, 39, 2],
  ]);
});

test('xếp hạng đội: nhiều trận thắng hơn đứng trên dù tổng điểm ghi được thấp hơn', () => {
  // A thắng 2 trận sát nút (21-19, 21-19 = 42 điểm), B thua nhưng ghi 38 + thắng 1 trận đậm C… → so A với C: C thắng 1 trận 21-0 nhưng thua 2
  const es = [E('a1', 'A', 'x1', 'x2'), E('a2', 'A', 'x3', 'x4'), E('c1', 'C', 'z1', 'z2'), E('c2', 'C', 'z3', 'z4')];
  const ms = [M('1', 'a1', 'c1', [[21, 19]]), M('2', 'a2', 'c2', [[21, 19]]), M('3', 'c1', 'a2', [[21, 0]])];
  const rows = teamRotTeamStandings(['A', 'C'], es, ms);
  assert.deepEqual(rows.map(r => [r.team, r.won, r.pointsFor]), [['A', 2, 42], ['C', 1, 59]]);
});

test('xếp hạng cá nhân: theo số trận thắng, rồi hiệu số; cùng hạng nếu bằng hết', () => {
  const rows = teamRotPersonStandings(entries, matches);
  const by = Object.fromEntries(rows.map(r => [r.person, r]));
  assert.deepEqual([by.a1.played, by.a1.won, by.a1.pointsFor, by.a1.diff], [1, 1, 21, 6]);
  assert.deepEqual([by.b3.played, by.b3.won, by.b3.pointsFor], [1, 1, 21]);
  // a1, a2, b3, b4 cùng 21 điểm, cùng 1 thắng; a1/a2 hiệu số +6 > b3/b4 +3
  assert.equal(by.a1.rank, 1); assert.equal(by.a2.rank, 1); assert.equal(by.b3.rank, 3);
  assert.equal(by.a1.team, 'A');
});
