import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callMatch, saveScore, withdrawPatches, inversePatches } from './actions.ts';
import type { TMatch } from './store.ts';
import type { ScoringRule } from './types.ts';

const r1: ScoringRule = { games: 1, points: 21, cap: 30 };
const M = (id: string, over: Partial<TMatch> = {}): TMatch => ({
  id, event: 'ev', stage: 'group', group: 'A', round: 1, order: 0, entryA: 'e1', entryB: 'e2', feeds: null, status: 'pending', court: 0,
  scores: [], winner: '', calledAt: 0, finishedAt: 0, log: [], version: 0, ...over,
});

test('callMatch: gọi trận vào sân, tăng version', () => {
  assert.deepEqual(callMatch(M('m', { version: 2 }), 3, 1000), { collection: 'matches', id: 'm', fields: { status: 'called', court: 3, called_at: 1000, version: 3 } });
});

test('saveScore vòng bảng: ghi tỉ số, đội thắng, xong; lần sửa thứ hai ghi log', () => {
  const r = saveScore({ match: M('m', { status: 'called' }), scores: [[21, 15]], rule: r1, eventMatches: [], uid: 'u', now: 5 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.patches[0].fields, { scores: [[21, 15]], winner: 'a', status: 'done', finished_at: 5, log: [], version: 1 });
  const again = saveScore({ match: M('m', { status: 'done', scores: [[21, 15]], winner: 'a' }), scores: [[15, 21]], rule: r1, eventMatches: [], uid: 'u', now: 9 });
  assert.equal(again.patches[0].fields.winner, 'b');
  assert.deepEqual(again.patches[0].fields.log, [{ at: 9, by: 'u', from: [[21, 15]], to: [[15, 21]] }]);
});

test('saveScore: tỉ số chưa phân thắng thua → báo lỗi, không ghi', () => {
  const r = saveScore({ match: M('m'), scores: [[20, 20]], rule: r1, eventMatches: [], uid: 'u', now: 1 });
  assert.ok(r.error);
  assert.equal(r.patches.length, 0);
});

test('saveScore: tỉ số sai luật nhưng có bên thắng → lưu được khi force, kèm cảnh báo khi không force', () => {
  const r = saveScore({ match: M('m'), scores: [[21, 20]], rule: r1, eventMatches: [], uid: 'u', now: 1 });
  assert.equal(r.needsConfirm, true);
  const f = saveScore({ match: M('m'), scores: [[21, 20]], rule: r1, eventMatches: [], uid: 'u', now: 1, force: true });
  assert.equal(f.patches[0].fields.winner, 'a');
});

test('saveScore vòng bảng bị khóa khi nhánh đã bắt đầu', () => {
  const ko = [M('sf', { stage: 'ko', status: 'called' })];
  const r = saveScore({ match: M('m', { status: 'done', scores: [[21, 1]], winner: 'a' }), scores: [[1, 21]], rule: r1, eventMatches: ko, uid: 'u', now: 1 });
  assert.ok(r.error);
});

test('saveScore nhánh: đưa đội thắng vào trận sau; chung kết thì đánh dấu nội dung xong', () => {
  const sf1 = M('sf1', { stage: 'ko', entryA: 'a1', entryB: 'b2' });
  const sf2 = M('sf2', { stage: 'ko', order: 1, entryA: 'b1', entryB: 'a2' });
  const f = M('f', { stage: 'ko', round: 2, entryA: '', entryB: '', feeds: { a: { match: 0 }, b: { match: 1 } } });
  const r = saveScore({ match: sf2, scores: [[10, 21]], rule: r1, eventMatches: [sf1, sf2, f], uid: 'u', now: 1 });
  assert.deepEqual(r.patches[1], { collection: 'matches', id: 'f', fields: { entry_b: 'a2' } });
  const fin = saveScore({ match: { ...f, entryA: 'a1', entryB: 'a2' }, scores: [[21, 3]], rule: r1, eventMatches: [sf1, sf2, f], uid: 'u', now: 2 });
  assert.deepEqual(fin.patches[1], { collection: 'events', id: 'ev', fields: { stage: 'done' } });
});

test('saveScore nhánh: không sửa được khi trận sau đã gọi', () => {
  const sf1 = M('sf1', { stage: 'ko', status: 'done', winner: 'a', scores: [[21, 1]], entryA: 'a1', entryB: 'b2' });
  const f = M('f', { stage: 'ko', round: 2, status: 'called', entryA: 'a1', entryB: 'x', feeds: { a: { match: 0 }, b: { match: 1 } } });
  const r = saveScore({ match: sf1, scores: [[1, 21]], rule: r1, eventMatches: [sf1, M('sf2', { stage: 'ko', order: 1 }), f], uid: 'u', now: 1 });
  assert.ok(r.error);
});

test('withdrawPatches: các trận chưa đánh của đôi bỏ cuộc → xử thắng cho đối thủ; trận đã xong giữ nguyên', () => {
  const ms = [M('m1', { status: 'done', winner: 'a', scores: [[21, 3]] }), M('m2', { entryA: 'e3', entryB: 'e1' }), M('m3', { entryA: 'e2', entryB: 'e3' })];
  const ps = withdrawPatches('e1', ms, 7);
  assert.deepEqual(ps.map(p => [p.id, p.fields.status, p.fields.winner]), [['m2', 'walkover', 'a']]);
});

test('inversePatches trả lại đúng giá trị cũ của các trường đã sửa', () => {
  const m = M('m', { status: 'called', court: 2, version: 4 });
  const inv = inversePatches([{ collection: 'matches', id: 'm', fields: { status: 'done', winner: 'a', version: 5 } }], [m], []);
  assert.deepEqual(inv, [{ collection: 'matches', id: 'm', fields: { status: 'called', winner: '', version: 6 } }]);
});
