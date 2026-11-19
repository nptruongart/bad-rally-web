import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, formatScore } from './score.ts';

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
