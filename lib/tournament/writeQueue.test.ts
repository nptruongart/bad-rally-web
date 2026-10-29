import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue, type PendingOp } from './writeQueue.ts';

// localStorage giả
const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const op = (id: string): PendingOp => ({ id, kind: 'score', payload: { id } });
const netErr = () => Object.assign(new Error('network'), { status: 0 });

test('lỗi mạng 2 lần rồi thành công: gửi thành công đúng 1 lần, giữ thứ tự, dọn bộ nhớ', async () => {
  const storage = memStorage();
  const sent: string[] = [];
  let fails = 2;
  const q = createWriteQueue({ storageKey: 'k', storage, retryDelays: [0, 0, 0], send: async (o) => {
    if (o.id === 'a' && fails-- > 0) throw netErr();
    sent.push(o.id);
  } });
  q.push(op('a'));
  q.push(op('b'));
  await q.flush();
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(JSON.parse(storage.getItem('k') || '[]').length, 0);
});

test('thao tác chưa gửi được lưu lại; hàng đợi mới gửi tiếp sau khi mở lại app', async () => {
  const storage = memStorage();
  const q1 = createWriteQueue({ storageKey: 'k', storage, retryDelays: [0], send: async () => { throw netErr(); }, maxAttemptsPerFlush: 1 });
  q1.push(op('a'));
  await q1.flush();
  assert.equal(JSON.parse(storage.getItem('k')!).length, 1);
  const sent: string[] = [];
  const q2 = createWriteQueue({ storageKey: 'k', storage, retryDelays: [0], send: async (o) => { sent.push(o.id); } });
  await q2.flush();
  assert.deepEqual(sent, ['a']);
});

test('lỗi dữ liệu (400) không thử lại mãi: bỏ thao tác, báo lỗi, gửi tiếp thao tác sau', async () => {
  const storage = memStorage();
  const sent: string[] = [], errors: string[] = [];
  const q = createWriteQueue({ storageKey: 'k', storage, retryDelays: [0], onError: (o) => errors.push(o.id), send: async (o) => {
    if (o.id === 'bad') throw Object.assign(new Error('bad'), { status: 400 });
    sent.push(o.id);
  } });
  q.push(op('bad'));
  q.push(op('ok'));
  await q.flush();
  assert.deepEqual(errors, ['bad']);
  assert.deepEqual(sent, ['ok']);
});

test('onState báo số thao tác đang chờ', async () => {
  const states: number[] = [];
  const q = createWriteQueue({ storageKey: 'k', storage: memStorage(), retryDelays: [0], onState: (n) => states.push(n), send: async () => {} });
  q.push(op('a'));
  await q.flush();
  assert.equal(states[0], 1);
  assert.equal(states.at(-1), 0);
});
