// Chạy: npm test  (Node ≥ 22.6, không cần cài thêm thư viện)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMatch, type MMPlayer, type Weights, type MatchRecord } from './matchmaking.ts';

const EQUAL: Weights = { playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0 };
const SKILL: Weights = { playCountFairness: 35, waitTimePriority: 10, avoidSamePartner: 85, avoidSameOpponents: 75, skillBalance: 100, keepPreviousPair: 0 };
const NOW = 10_000_000;

const mk = (n: number, f: (i: number) => Partial<MMPlayer> = () => ({})): MMPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, playCount: 0, waitSince: NOW - (n - i) * 60_000, skill: 5, gender: 'M', ...f(i) }));
const ids = (r: [MMPlayer[], MMPlayer[]] | null) => r && [...r[0], ...r[1]].map(p => p.id).sort();

test('không đủ người → null', () => {
  assert.equal(pickMatch(mk(3), '2v2', EQUAL, [], NOW), null);
});

test('đúng số người mỗi đội theo kiểu trận', () => {
  for (const [type, a, b] of [['1v1', 1, 1], ['1v2', 1, 2], ['2v2', 2, 2]] as const) {
    const r = pickMatch(mk(8), type, EQUAL, [], NOW)!;
    assert.deepEqual([r[0].length, r[1].length], [a, b]);
  }
});

test('ưu tiên người ít trận nhất', () => {
  const ps = mk(8, i => ({ playCount: i < 4 ? 3 : 0 }));
  assert.deepEqual(ids(pickMatch(ps, '2v2', EQUAL, [], NOW)), ['p4', 'p5', 'p6', 'p7']);
});

test('bằng số trận → ai chờ lâu hơn được ưu tiên', () => {
  const ps = mk(8); // p0 chờ lâu nhất
  assert.deepEqual(ids(pickMatch(ps, '2v2', EQUAL, [], NOW)), ['p0', 'p1', 'p2', 'p3']);
});

test('cặp cố định luôn chung đội', () => {
  const ps = mk(8, i => (i === 0 ? { partnerId: 'p5' } : i === 5 ? { partnerId: 'p0' } : {}));
  const r = pickMatch(ps, '2v2', EQUAL, [], NOW)!;
  const team = r.find(t => t.some(p => p.id === 'p0'))!;
  assert.ok(team.some(p => p.id === 'p5'));
});

test('đôi nam nữ: mỗi đội 1 nam + 1 nữ', () => {
  const ps = mk(10, i => ({ gender: i % 3 === 0 ? 'F' : 'M' }));
  const r = pickMatch(ps, '2v2', EQUAL, [], NOW, 'XD')!;
  for (const t of r) assert.deepEqual(t.map(p => p.gender ?? 'M').sort(), ['F', 'M']);
});

test('đôi nam nữ thiếu nữ → null', () => {
  assert.equal(pickMatch(mk(8, i => ({ gender: i === 0 ? 'F' : 'M' })), '2v2', EQUAL, [], NOW, 'XD'), null);
});

test('đôi nữ chỉ chọn nữ', () => {
  const ps = mk(10, i => ({ gender: i < 5 ? 'F' : 'M' }));
  assert.ok(pickMatch(ps, '2v2', EQUAL, [], NOW, 'WD')!.flat().every(p => p.gender === 'F'));
});

test('chia đội cân trình độ', () => {
  const ps = mk(4, i => ({ skill: [9, 8, 1, 0][i] }));
  const [a, b] = pickMatch(ps, '2v2', SKILL, [], NOW)!;
  const avg = (t: MMPlayer[]) => t.reduce((s, p) => s + p.skill, 0) / t.length;
  assert.ok(Math.abs(avg(a) - avg(b)) <= 1);
});

test('tránh lặp lại đồng đội cũ', () => {
  const ps = mk(4);
  const history: MatchRecord[] = [{ t1: ['p0', 'p1'], t2: ['p2', 'p3'], at: 1 }];
  const [a] = pickMatch(ps, '2v2', { ...EQUAL, avoidSamePartner: 100 }, history, NOW)!;
  const pair = a.map(p => p.id).sort().join();
  assert.notEqual(pair, 'p0,p1');
  assert.notEqual(pair, 'p2,p3');
});

test('đủ nhanh với 60 người và 300 trận lịch sử', () => {
  const ps = mk(60, i => ({ playCount: i % 3, skill: i % 10, gender: i % 2 ? 'F' : 'M' }));
  const history: MatchRecord[] = Array.from({ length: 300 }, (_, i) => ({ t1: [`p${i % 60}`, `p${(i * 7) % 60}`], t2: [`p${(i * 11) % 60}`, `p${(i * 13) % 60}`], at: i }));
  const t = performance.now();
  for (let k = 0; k < 20; k++) pickMatch(ps, '2v2', SKILL, history, NOW, k % 2 ? 'XD' : 'any');
  assert.ok((performance.now() - t) / 20 < 50);
});
