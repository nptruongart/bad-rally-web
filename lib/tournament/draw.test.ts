import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawGroups, knockoutPlan, roundRobin, suggestFormat } from './draw.ts';

// rng xác định cho test
const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `E${i + 1}`);

test('suggestFormat: 4–5 đôi vòng tròn, 6–12 đôi 2 bảng lấy 2', () => {
  assert.equal(suggestFormat(4).format, 'rr');
  assert.equal(suggestFormat(5).format, 'rr');
  for (const n of [6, 8, 9, 12]) assert.deepEqual(suggestFormat(n), { format: 'groups_ko', groups: 2, advance: 2 });
});

test('drawGroups 7 đôi 2 bảng: 4+3, hai hạt giống khác bảng', () => {
  const entries = ids(7).map((id, i) => ({ id, seed: i < 2 ? i + 1 : undefined }));
  const g = drawGroups(entries, 2, seeded());
  assert.deepEqual([g.A.length, g.B.length].sort(), [3, 4]);
  assert.ok(g.A.includes('E1') && g.B.includes('E2'));
  assert.equal([...g.A, ...g.B].sort().join(), ids(7).sort().join());
});

test('drawGroups 12 đôi 4 bảng: mỗi bảng 3, mỗi bảng một hạt giống', () => {
  const entries = ids(12).map((id, i) => ({ id, seed: i < 4 ? i + 1 : undefined }));
  const g = drawGroups(entries, 4, seeded(7));
  for (const [k, s] of [['A', 'E1'], ['B', 'E2'], ['C', 'E3'], ['D', 'E4']] as const) {
    assert.equal(g[k].length, 3);
    assert.ok(g[k].includes(s));
  }
});

const checkRR = (n: number, rounds: number) => {
  const m = roundRobin(ids(n));
  assert.equal(m.length, (n * (n - 1)) / 2);
  assert.equal(new Set(m.map(x => x.round)).size, rounds);
  for (const id of ids(n)) assert.equal(m.filter(x => x.a === id || x.b === id).length, n - 1);
  for (let r = 1; r <= rounds; r++) {
    const inRound = m.filter(x => x.round === r).flatMap(x => [x.a, x.b]);
    assert.equal(new Set(inRound).size, inRound.length);
  }
  const pairs = new Set(m.map(x => [x.a, x.b].sort().join('-')));
  assert.equal(pairs.size, m.length);
};

test('roundRobin 5 đôi: 10 trận, 5 vòng, có đôi nghỉ', () => checkRR(5, 5));
test('roundRobin 4 đôi: 6 trận, 3 vòng', () => checkRR(4, 3));
test('roundRobin 6 đôi: 15 trận', () => checkRR(6, 5));

test('knockoutPlan 2 bảng lấy 2: bán kết chéo A1–B2, B1–A2, chung kết', () => {
  assert.deepEqual(knockoutPlan(2, 2), [
    { round: 1, slot: 0, a: { group: 'A', place: 1 }, b: { group: 'B', place: 2 } },
    { round: 1, slot: 1, a: { group: 'B', place: 1 }, b: { group: 'A', place: 2 } },
    { round: 2, slot: 0, a: { match: 0 }, b: { match: 1 } },
  ]);
});

test('knockoutPlan 4 bảng lấy 2: tứ kết A1–B2, C1–D2, B1–A2, D1–C2', () => {
  const p = knockoutPlan(4, 2);
  assert.deepEqual(p.slice(0, 4).map(m => `${'group' in m.a ? m.a.group + m.a.place : ''}-${'group' in m.b ? m.b.group + m.b.place : ''}`), ['A1-B2', 'C1-D2', 'B1-A2', 'D1-C2']);
  assert.deepEqual(p.slice(4).map(m => [m.round, m.a, m.b]), [
    [2, { match: 0 }, { match: 1 }], [2, { match: 2 }, { match: 3 }], [3, { match: 4 }, { match: 5 }],
  ]);
});

test('knockoutPlan 2 bảng lấy 1: chỉ chung kết A1–B1', () => {
  assert.deepEqual(knockoutPlan(2, 1), [{ round: 1, slot: 0, a: { group: 'A', place: 1 }, b: { group: 'B', place: 1 } }]);
});

test('knockoutPlan 4 bảng lấy 1: bán kết A1–C1, B1–D1', () => {
  const p = knockoutPlan(4, 1);
  assert.deepEqual(p.slice(0, 2).map(m => [m.a, m.b]), [
    [{ group: 'A', place: 1 }, { group: 'C', place: 1 }], [{ group: 'B', place: 1 }, { group: 'D', place: 1 }],
  ]);
  assert.deepEqual(p[2], { round: 2, slot: 0, a: { match: 0 }, b: { match: 1 } });
});
