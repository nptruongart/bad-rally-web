// Tạo giải mẫu trên PocketBase LOCAL để thử giao diện (tài khoản test-…). Không bao giờ chạy với server thật.
// Dùng: node --experimental-strip-types --no-warnings scripts/tournament-sim.mjs [demo|registration]
//   demo         : giải đang thi đấu, Đôi nam 7 đôi (2 bảng) + Nam nữ 5 đôi (vòng tròn), có sẵn vài kết quả
//   registration : giải đang mở đăng ký, 3 nội dung, có sẵn vài đôi (người đánh 2 nội dung)
// In ra mã giải và mã BTC.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { roundRobin, drawGroups } from '../lib/tournament/draw.ts';

const PB = 'http://127.0.0.1:8090';
const mode = process.argv[2] || 'demo';
const rnd = (n = 12) => randomBytes(n).toString('hex').slice(0, n);
const j = async (method, path, body, token) => {
  const r = await fetch(PB + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data;
};
const admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
const su = (await j('POST', '/api/collections/_superusers/auth-with-password', { identity: admin.email, password: admin.password })).token;

const email = `test-btc-${rnd()}@anon.badrally.app`, password = rnd(20);
const u = await j('POST', '/api/collections/users/records', { email, password, passwordConfirm: password });
await j('PATCH', `/api/collections/users/records/${u.id}`, { is_host: true }, su);
const host = (await j('POST', '/api/collections/users/auth-with-password', { identity: email, password })).token;

const t = await j('POST', '/api/badrally/tournament-create', { name: mode === 'demo' ? 'Giải mẫu CLB (đang đấu)' : 'Giải mẫu CLB (mở đăng ký)' }, host);
await j('PATCH', `/api/collections/tournaments/records/${t.id}`, {
  status: mode === 'demo' ? 'running' : 'registration',
  courts: [{ id: 1, name: 'Sân 5' }, { id: 2, name: 'Sân 6' }, { id: 3, name: 'Sân 7' }],
  reg_deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
}, host);

const person = (name, gender, skill = 'Trung bình') => j('POST', '/api/collections/participants/records', { tournament: t.id, name, gender, skill }, host);
const men = [], women = [];
for (const n of ['Nam', 'Hùng', 'Tuấn', 'Minh', 'An', 'Bình', 'Cường', 'Dũng', 'Đạt', 'Huy', 'Khoa', 'Long', 'Phúc', 'Quang']) men.push(await person(n, 'M'));
for (const n of ['Lan', 'Mai', 'Hoa', 'Thảo', 'Vy', 'Ngọc', 'Trang', 'Linh']) women.push(await person(n, 'F'));

const ev = (name, category, order, extra = {}) => j('POST', '/api/collections/events/records', { tournament: t.id, name, category, max_entries: 12, scoring: { games: 1, points: 21, cap: 30 }, stage: 'registration', order, ...extra }, host);
const entry = (event, p1, p2, extra = {}) => j('POST', '/api/collections/entries/records', { event: event.id, p1: p1.id, p2: p2.id, status: 'approved', ...extra }, host);
const match = (event, extra) => j('POST', '/api/collections/matches/records', { event: event.id, status: 'pending', version: 0, ...extra }, host);

if (mode === 'demo') {
  const md = await ev('Đôi nam', 'MD', 0, { format: 'groups_ko', groups: 2, advance: 2, stage: 'groups' });
  const xd = await ev('Nam nữ', 'XD', 1, { format: 'rr', stage: 'groups', scoring: { games: 3, points: 15, cap: 21 } });
  const mdEntries = [];
  for (let i = 0; i < 7; i++) mdEntries.push(await entry(md, men[i * 2], men[i * 2 + 1], { seed: i < 2 ? i + 1 : 0 }));
  const groups = drawGroups(mdEntries.map(e => ({ id: e.id, seed: e.seed || undefined })), 2, Math.random);
  for (const g of ['A', 'B']) {
    for (const id of groups[g]) await j('PATCH', `/api/collections/entries/records/${id}`, { group: g }, host);
    let order = 0;
    for (const m of roundRobin(groups[g])) {
      const done = m.round === 1;
      await match(md, { stage: 'group', group: g, round: m.round, order: order++, entry_a: m.a, entry_b: m.b,
        ...(done ? { status: 'done', scores: [[21, 12 + order]], winner: 'a', finished_at: Date.now() - 600000 } : {}) });
    }
  }
  // Nhánh: bán kết chéo + chung kết, chưa có đội
  await match(md, { stage: 'ko', round: 1, order: 0, feeds: { a: { group: 'A', place: 1 }, b: { group: 'B', place: 2 } } });
  await match(md, { stage: 'ko', round: 1, order: 1, feeds: { a: { group: 'B', place: 1 }, b: { group: 'A', place: 2 } } });
  await match(md, { stage: 'ko', round: 2, order: 0, feeds: { a: { match: 0 }, b: { match: 1 } } });

  // Nam nữ: Nam (men[0]) đánh cả Đôi nam và Nam nữ
  const xdEntries = [];
  for (let i = 0; i < 5; i++) xdEntries.push(await entry(xd, men[i === 0 ? 0 : 7 + i], women[i], { group: 'A' }));
  let order = 0;
  for (const m of roundRobin(xdEntries.map(e => e.id))) {
    await match(xd, { stage: 'group', group: 'A', round: m.round, order: order++, entry_a: m.a, entry_b: m.b,
      ...(m.round === 1 && order === 1 ? { status: 'playing', court: 1, called_at: Date.now() } : {}) });
  }
} else {
  const md = await ev('Đôi nam', 'MD', 0);
  const wd = await ev('Đôi nữ', 'WD', 1);
  const xd = await ev('Nam nữ', 'XD', 2);
  for (let i = 0; i < 4; i++) await entry(md, men[i * 2], men[i * 2 + 1], { status: i < 3 ? 'approved' : 'pending' });
  await entry(wd, women[0], women[1]);
  await entry(xd, men[0], women[2]);
}

console.log(`Mã giải: ${t.code}`);
console.log(`Mã BTC: ${t.btcCode}`);
