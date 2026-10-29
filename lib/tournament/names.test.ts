import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, suggestNames } from './names.ts';

test('normalizeName bỏ dấu, đ→d, hạ chữ, gộp khoảng trắng', () => {
  assert.equal(normalizeName('  Nguyễn   Đức  Nam '), 'nguyen duc nam');
  assert.equal(normalizeName('ĐẶNG Thị Ánh'), 'dang thi anh');
});

test('suggestNames khớp không dấu, ưu tiên khớp đầu tên, giới hạn số kết quả', () => {
  const people = [{ id: '1', name: 'Nguyễn Nam' }, { id: '2', name: 'Trần Nam' }, { id: '3', name: 'Lan' }, { id: '4', name: 'Nam Anh' }];
  assert.deepEqual(suggestNames('nguyen  nam', people).map(p => p.id), ['1']);
  assert.deepEqual(suggestNames('nam', people).map(p => p.id), ['4', '1', '2']);
  assert.equal(suggestNames('', people).length, 0);
  assert.equal(suggestNames('n', people, 2).length, 2);
});
