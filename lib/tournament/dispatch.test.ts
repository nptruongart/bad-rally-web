import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planQueue, type DMatch } from './dispatch.ts';

const MIN = 60_000;
const NOW = 1_000_000_000;
const m = (id: string, over: Partial<DMatch> = {}): DMatch => ({ id, event: 'MD', stage: 'group', round: 1, order: 0, entryA: 'E1', entryB: 'E2', status: 'pending', ...over });
// X đánh cả Đôi nam (E1) và Nam nữ (E5)
const people = { E1: ['X', 'P1'], E2: ['P2', 'P3'], E3: ['P4', 'P5'], E4: ['P6', 'P7'], E5: ['X', 'F1'], E6: ['P8', 'F2'], E7: ['P9', 'P10'], E8: ['P11', 'P12'] };
const ids = (xs: { id: string }[]) => xs.map(x => x.id);

test('người đang đánh ở nội dung khác → trận bị khóa "busy"', () => {
  const q = planQueue({ matches: [m('md', { status: 'playing' }), m('xd', { event: 'XD', entryA: 'E5', entryB: 'E6' })], people, now: NOW, restMs: 10 * MIN });
  assert.deepEqual(ids(q.ready), []);
  assert.equal(q.blocked[0].match.id, 'xd');
  assert.deepEqual(q.blocked[0].reason, { kind: 'busy', person: 'X', matchId: 'md' });
});

test('chưa nghỉ đủ → khóa "rest" tới finishedAt + restMs; nghỉ đủ → sẵn sàng', () => {
  const done = m('md', { status: 'done', finishedAt: NOW - 4 * MIN });
  const xd = m('xd', { event: 'XD', entryA: 'E5', entryB: 'E6' });
  const q1 = planQueue({ matches: [done, xd], people, now: NOW, restMs: 10 * MIN });
  assert.deepEqual(q1.blocked[0].reason, { kind: 'rest', person: 'X', until: NOW + 6 * MIN });
  const q2 = planQueue({ matches: [{ ...done, finishedAt: NOW - 11 * MIN }, xd], people, now: NOW, restMs: 10 * MIN });
  assert.deepEqual(ids(q2.ready), ['xd']);
});

test('nội dung miễn nghỉ (đồng đội xoay cặp): vừa đánh trận cùng nội dung vẫn gọi được; vừa đánh nội dung khác thì vẫn phải nghỉ', () => {
  const doneT = m('t1', { event: 'TEAM', status: 'done', finishedAt: NOW - 1 * MIN });
  const nextT = m('t2', { event: 'TEAM', entryA: 'E5', entryB: 'E6' });
  const q1 = planQueue({ matches: [doneT, nextT], people, now: NOW, restMs: 10 * MIN, restExempt: ['TEAM'] });
  assert.deepEqual(ids(q1.ready), ['t2']);
  const doneMd = m('md', { status: 'done', finishedAt: NOW - 1 * MIN });
  const q2 = planQueue({ matches: [doneMd, nextT], people, now: NOW, restMs: 10 * MIN, restExempt: ['TEAM'] });
  assert.equal(q2.blocked[0].reason.kind, 'rest');
  // Trận thường sau trận đồng đội vẫn tính nghỉ
  const md2 = m('md2', { entryA: 'E5', entryB: 'E7' });
  const q3 = planQueue({ matches: [doneT, md2], people, now: NOW, restMs: 10 * MIN, restExempt: ['TEAM'] });
  assert.equal(q3.blocked[0].reason.kind, 'rest');
});

test('thứ tự: vòng bảng trước nhánh, vòng nhỏ trước', () => {
  const q = planQueue({ matches: [
    m('ko', { stage: 'ko', entryA: 'E3', entryB: 'E4' }),
    m('g2', { round: 2, entryA: 'E5', entryB: 'E6' }),
    m('g1', { round: 1 }),
  ], people, now: NOW, restMs: 0 });
  assert.deepEqual(ids(q.ready), ['g1', 'g2', 'ko']);
});

test('cùng vòng: nội dung còn nhiều trận hơn được ưu tiên', () => {
  const q = planQueue({ matches: [
    m('wd1', { event: 'WD', entryA: 'E3', entryB: 'E4' }),
    m('md1'), m('md2', { entryA: 'E5', entryB: 'E6', round: 2 }),
  ], people, now: NOW, restMs: 0 });
  assert.deepEqual(ids(q.ready), ['md1', 'wd1', 'md2']);
});

test('cùng vòng, cùng số trận còn lại: người chờ lâu hơn trước, rồi theo order', () => {
  const q = planQueue({ matches: [
    m('old', { status: 'done', finishedAt: NOW - 30 * MIN, entryA: 'E5', entryB: 'E6', event: 'X' }),
    m('a', { event: 'WD', entryA: 'E3', entryB: 'E4', order: 0 }),
    m('b', { event: 'MD', entryA: 'E5', entryB: 'E6', order: 0 }), // vừa đánh xong lúc NOW-30'
    m('c', { event: 'MD', order: 1, entryA: 'E7', entryB: 'E8' }),
  ].map(x => (x.id === 'a' ? { ...x, event: 'MD' } : x)), people, now: NOW, restMs: 0 });
  assert.deepEqual(ids(q.ready), ['a', 'c', 'b']);
});

test('trận nhánh còn thiếu đội không xuất hiện', () => {
  const q = planQueue({ matches: [m('ko', { stage: 'ko', entryB: undefined })], people, now: NOW, restMs: 0 });
  assert.equal(q.ready.length + q.blocked.length, 0);
});
