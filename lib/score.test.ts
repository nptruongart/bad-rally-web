import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, formatScore, pointDiffs, formatDiff, rankCompare } from './score.ts';

test('tỉ số hợp lệ → đội điểm cao hơn thắng', () => {
  assert.deepEqual(parseScore('21', '15'), { ok: true, s: [21, 15], w: 1 });
  assert.deepEqual(parseScore(' 19 ', '21'), { ok: true, s: [19, 21], w: 2 });
  assert.deepEqual(parseScore('30', '29'), { ok: true, s: [30, 29], w: 1 });
  assert.deepEqual(parseScore('0', '11'), { ok: true, s: [0, 11], w: 2 });
});

test('thiếu ô, hòa, không phải số hoặc quá lớn → lỗi', () => {
  assert.deepEqual(parseScore('', '15'), { ok: false, error: 'empty' });
  assert.deepEqual(parseScore('21', ''), { ok: false, error: 'empty' });
  assert.deepEqual(parseScore('20', '20'), { ok: false, error: 'tie' });
  assert.deepEqual(parseScore('2a', '15'), { ok: false, error: 'invalid' });
  assert.deepEqual(parseScore('-3', '15'), { ok: false, error: 'invalid' });
  assert.deepEqual(parseScore('100', '15'), { ok: false, error: 'invalid' });
});

test('hiển thị tỉ số theo thứ tự đội 1 – đội 2', () => {
  assert.equal(formatScore([21, 15]), '21 – 15');
  assert.equal(formatScore(undefined), '');
});

test('hiệu số: cộng dồn điểm ghi được trừ điểm thua, cả 2 người trong đội như nhau; trận không có tỉ số bỏ qua', () => {
  const d = pointDiffs([
    { t1: ['a', 'b'], t2: ['c', 'd'], at: 1, w: 1, s: [21, 10] },
    { t1: ['c', 'a'], t2: ['b', 'd'], at: 2, w: 2, s: [19, 21] },
    { t1: ['a'], t2: ['c'], at: 3, w: 1 },
  ]);
  assert.equal(d.get('a'), 11 - 2);
  assert.equal(d.get('b'), 11 + 2);
  assert.equal(d.get('c'), -11 - 2);
  assert.equal(d.get('d'), -11 + 2);
  assert.equal(pointDiffs([{ t1: ['x'], t2: ['y'], at: 1, w: 1 }]).has('x'), false);
});

test('hiển thị hiệu số', () => {
  assert.equal(formatDiff(18), '+18');
  assert.equal(formatDiff(-9), '−9');
  assert.equal(formatDiff(0), '±0');
  assert.equal(formatDiff(undefined), '');
});

test('xếp hạng: nhiều trận thắng hơn → hiệu số cao hơn → ít trận hơn', () => {
  const diffs = new Map([['an', 18], ['binh', -9]]);
  const P = (id: string, wins: number, playCount: number) => ({ id, wins, playCount });
  const order = (ps: ReturnType<typeof P>[]) => [...ps].sort((x, y) => rankCompare(x, y, diffs)).map(p => p.id);
  assert.deepEqual(order([P('binh', 2, 3), P('an', 2, 3)]), ['an', 'binh']);
  assert.deepEqual(order([P('an', 1, 3), P('binh', 2, 3)]), ['binh', 'an']);
  assert.deepEqual(order([P('cuong', 2, 4), P('dung', 2, 3)]), ['dung', 'cuong']); // không có hiệu số = 0
  assert.deepEqual(order([P('binh', 2, 3), P('cuong', 2, 2)]), ['cuong', 'binh']); // 0 > −9
});
