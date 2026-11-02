import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, hasContent, sessionText, daysLeft, SESSION_TTL_DAYS } from './session.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 12, 0); // 19:00 giờ VN
const P = (id: string, name: string, playCount: number, wins: number, gender?: 'M' | 'F') => ({ id, name, gender, skill: 'Trung bình', playCount, wins });

test('trận lấy tên đã lưu sẵn trong lịch sử; không có thì tra theo người chơi còn trong phòng; mất hẳn thì "?"', () => {
  const s = buildSession({
    roomName: 'Tối thứ 3', pin: '123456', roomCreated: T0, now: T0 + 2 * 3600_000,
    players: [P('a', 'Hùng', 1, 1), P('b', 'Nhi', 1, 1)],
    history: [
      { t1: ['a', 'b'], t2: ['x', 'y'], at: T0 + 600_000, w: 1, n1: ['Hùng', 'Nhi'], n2: ['Lan', 'Vy'] },
      { t1: ['a', 'zz'], t2: ['b', 'x'], at: T0 + 1200_000 },
    ],
  });
  assert.deepEqual(s.matches[0], { a: ['Hùng', 'Nhi'], b: ['Lan', 'Vy'], w: 1, at: T0 + 600_000 });
  assert.deepEqual(s.matches[1], { a: ['Hùng', '?'], b: ['Nhi', '?'], w: 0, at: T0 + 1200_000 });
});

test('xếp hạng: chỉ người đã đánh; nhiều thắng trước, bằng thắng thì ít trận hơn trước, rồi theo tên', () => {
  const s = buildSession({
    roomName: '', pin: '123456', roomCreated: T0, now: T0,
    players: [P('1', 'Bảo', 4, 2), P('2', 'An', 3, 2), P('3', 'Cường', 2, 2), P('4', 'Dũng', 0, 0), P('5', 'Đạt', 3, 2)],
    history: [],
  });
  assert.deepEqual(s.players.map(p => p.name), ['Cường', 'An', 'Đạt', 'Bảo']);
  assert.equal(s.players[0].played, 2);
});

test('giờ bắt đầu = lúc tạo phòng; không biết thì lấy trận đầu tiên; trận sắp theo thời gian', () => {
  const h = [{ t1: ['a'], t2: ['b'], at: T0 + 5000 }, { t1: ['a'], t2: ['b'], at: T0 + 1000 }];
  const s = buildSession({ roomName: '', pin: '1', roomCreated: 0, now: T0 + 9000, players: [], history: h });
  assert.equal(s.startedAt, T0 + 1000);
  assert.equal(s.endedAt, T0 + 9000);
  assert.deepEqual(s.matches.map(m => m.at), [T0 + 1000, T0 + 5000]);
});

test('buổi chưa có trận nào và chưa ai đánh thì không cần lưu', () => {
  const empty = buildSession({ roomName: '', pin: '1', roomCreated: T0, now: T0, players: [P('a', 'A', 0, 0)], history: [] });
  assert.equal(hasContent(empty), false);
  const played = buildSession({ roomName: '', pin: '1', roomCreated: T0, now: T0, players: [P('a', 'A', 1, 0)], history: [] });
  assert.equal(hasContent(played), true);
});

test('văn bản gửi nhóm Zalo: tên buổi, ngày, số trận, bảng xếp hạng', () => {
  const s = buildSession({
    roomName: 'CLB Phú Thọ', pin: '123456', roomCreated: T0, now: T0 + 3600_000,
    players: [P('a', 'Hùng', 2, 2), P('b', 'Nhi', 2, 0)],
    history: [{ t1: ['a'], t2: ['b'], at: T0 + 60_000, w: 1, n1: ['Hùng'], n2: ['Nhi'] }],
  });
  const txt = sessionText(s);
  assert.match(txt, /CLB Phú Thọ/);
  assert.match(txt, /02\/11\/2026/);
  assert.match(txt, /1 trận · 2 người/);
  assert.match(txt, /1\. Hùng – 2 thắng \/ 2 trận/);
  assert.match(txt, /2\. Nhi – 0 thắng \/ 2 trận/);
});

test('còn bao nhiêu ngày trước khi tự xóa (giữ 30 ngày, làm tròn lên, không âm)', () => {
  assert.equal(SESSION_TTL_DAYS, 30);
  assert.equal(daysLeft(T0, T0), 30);
  assert.equal(daysLeft(T0, T0 + 29.5 * DAY), 1);
  assert.equal(daysLeft(T0, T0 + 31 * DAY), 0);
});
