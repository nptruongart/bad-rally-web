import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCalls, myNextMatches } from './mine.ts';
import type { TMatch } from './store.ts';

const M = (id: string, over: Partial<TMatch> = {}): TMatch => ({
  id, event: 'ev', stage: 'group', group: 'A', round: 1, order: 0, entryA: 'e1', entryB: 'e2', feeds: null, status: 'pending', court: 0,
  scores: [], winner: '', calledAt: 0, finishedAt: 0, log: [], version: 0, ...over,
});

test('newCalls: trận của tôi đang được gọi mà chưa bấm OK thì báo (kể cả lúc vừa mở lại app)', () => {
  const ms = [M('m1', { status: 'called', calledAt: 5 }), M('m2', { status: 'called', entryA: 'x', entryB: 'y' }), M('m3', { status: 'pending' })];
  assert.deepEqual(newCalls(['e1'], ms, []).map(m => m.id), ['m1']);
  assert.deepEqual(newCalls(['e1'], ms, ['m1:5']), []);
});

test('newCalls: bị gọi lại (trả về hàng chờ rồi gọi lần nữa) thì báo lại', () => {
  assert.deepEqual(newCalls(['e1'], [M('m1', { status: 'called', calledAt: 9 })], ['m1:5']).map(m => m.id), ['m1']);
});

test('myNextMatches: trận đang được gọi ưu tiên hơn trận vòng sớm hơn còn chờ', () => {
  const ms = [M('r1', { round: 1 }), M('r3', { round: 3, status: 'called', court: 3 })];
  assert.deepEqual(myNextMatches(['e1'], ms).map(m => m.id), ['r3']);
});

test('myNextMatches: mỗi đôi của tôi lấy trận chưa xong sớm nhất', () => {
  const ms = [
    M('a1', { status: 'done' }), M('a2', { round: 2 }), M('a3', { round: 3 }),
    M('b1', { event: 'xd', entryA: 'e5', entryB: 'e6', round: 1, status: 'called' }),
  ];
  assert.deepEqual(myNextMatches(['e1', 'e5'], ms).map(m => m.id), ['b1', 'a2']);
});
