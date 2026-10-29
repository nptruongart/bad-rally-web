import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventMatches, fillKoFromGroups, nextFromWinner, groupResultLocked, suggestSeeds } from './bracket.ts';
import type { Entry, Participant, TMatch } from './store.ts';

const ids = (n: number, p = 'E') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const M = (over: Partial<TMatch>): TMatch => ({
  id: 'x', event: 'ev', stage: 'ko', group: '', round: 1, order: 0, entryA: '', entryB: '', feeds: null, status: 'pending', court: 0,
  scores: [], winner: '', calledAt: 0, finishedAt: 0, log: [], version: 0, ...over,
});

test('buildEventMatches vòng tròn 5 đôi: 10 trận vòng bảng A, không có nhánh', () => {
  const ms = buildEventMatches({ format: 'rr', groups: { A: ids(5) } });
  assert.equal(ms.length, 10);
  assert.ok(ms.every(m => m.stage === 'group' && m.group === 'A'));
  assert.equal(new Set(ms.map(m => m.order)).size, 10);
});

test('buildEventMatches 2 bảng 4+3 lấy 2: 9 trận bảng + 3 trận nhánh có feeds', () => {
  const ms = buildEventMatches({ format: 'groups_ko', groups: { A: ids(4, 'A'), B: ids(3, 'B') }, groupCount: 2, advance: 2 });
  assert.equal(ms.filter(m => m.stage === 'group').length, 6 + 3);
  const ko = ms.filter(m => m.stage === 'ko');
  assert.equal(ko.length, 3);
  assert.deepEqual(ko.map(m => [m.round, m.order]), [[1, 0], [1, 1], [2, 0]]);
  assert.deepEqual(ko[0].feeds, { a: { group: 'A', place: 1 }, b: { group: 'B', place: 2 } });
  assert.deepEqual(ko[2].feeds, { a: { match: 0 }, b: { match: 1 } });
});

test('fillKoFromGroups điền đội vào vòng đầu nhánh theo hạng bảng', () => {
  const ko = [
    M({ id: 'sf1', feeds: { a: { group: 'A', place: 1 }, b: { group: 'B', place: 2 } } }),
    M({ id: 'sf2', order: 1, feeds: { a: { group: 'B', place: 1 }, b: { group: 'A', place: 2 } } }),
    M({ id: 'f', round: 2, feeds: { a: { match: 0 }, b: { match: 1 } } }),
  ];
  const ups = fillKoFromGroups(ko, { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'] });
  assert.deepEqual(ups, [{ id: 'sf1', entryA: 'a1', entryB: 'b2' }, { id: 'sf2', entryA: 'b1', entryB: 'a2' }]);
});

test('nextFromWinner: đội thắng bán kết 2 vào ô b của chung kết; chung kết thì không có trận sau', () => {
  const ko = [M({ id: 'sf1' }), M({ id: 'sf2', order: 1 }), M({ id: 'f', round: 2, feeds: { a: { match: 0 }, b: { match: 1 } } })];
  assert.deepEqual(nextFromWinner(ko, 'sf2', 'b2'), { id: 'f', side: 'b', entry: 'b2' });
  assert.equal(nextFromWinner(ko, 'f', 'x'), null);
});

test('groupResultLocked: khóa sửa vòng bảng khi trận nhánh đã gọi/đánh/xong', () => {
  assert.equal(groupResultLocked([M({ status: 'pending', entryA: 'a' })]), false);
  assert.equal(groupResultLocked([M({ status: 'called' })]), true);
  assert.equal(groupResultLocked([M({ status: 'done' })]), true);
});

test('suggestSeeds chọn các đôi có tổng trình độ cao nhất', () => {
  const P = (id: string, skill: string): Participant => ({ id, tournament: 't', name: id, gender: 'M', skill, users: [] });
  const E = (id: string, p1: string, p2: string): Entry => ({ id, event: 'ev', p1, p2, status: 'approved', seed: 0, group: '', paid: false, createdBy: '' });
  const people = [P('a', 'Khá+'), P('b', 'Khá'), P('c', 'Yếu'), P('d', 'Yếu'), P('e', 'Trung bình'), P('f', 'Khá+')];
  const entries = [E('e1', 'c', 'd'), E('e2', 'a', 'b'), E('e3', 'e', 'f')];
  assert.deepEqual(suggestSeeds(entries, people, 2), ['e2', 'e3']);
});
