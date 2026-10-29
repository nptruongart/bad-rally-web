// Kiểm tra quyền + hook của chế độ Giải đấu trên PocketBase LOCAL (không bao giờ chạy với server thật).
// Dùng: node scripts/tournament-rules-test.mjs   (cần .\scripts\local-pb.ps1 đang chạy và đã seed)
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const PB = 'http://127.0.0.1:8090';
if (!PB.includes('127.0.0.1')) throw new Error('Chỉ chạy với PocketBase local');
const rnd = (n = 12) => randomBytes(n).toString('hex').slice(0, n);
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const j = async (method, path, body, token) => {
  const r = await fetch(PB + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
};

const admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
const su = (await j('POST', '/api/collections/_superusers/auth-with-password', { identity: admin.email, password: admin.password })).j.token;
const created = { users: [], tournaments: [] };

const user = async (isHost = false) => {
  const email = `test-${rnd()}@anon.badrally.app`, password = rnd(20);
  const u = await j('POST', '/api/collections/users/records', { email, password, passwordConfirm: password });
  created.users.push(u.j.id);
  if (isHost) await j('PATCH', `/api/collections/users/records/${u.j.id}`, { is_host: true }, su);
  const a = await j('POST', '/api/collections/users/auth-with-password', { identity: email, password });
  return { id: u.j.id, token: a.j.token };
};
const count = async (col) => (await j('GET', `/api/collections/${col}/records?perPage=1`, null, su)).j.totalItems;

try {
  const roomsBefore = await count('rooms'), playersBefore = await count('players');
  const host = await user(true), host2 = await user(true), guest = await user(), guest2 = await user();

  // --- Tạo giải ---
  ok((await j('POST', '/api/badrally/tournament-create', { name: 'X' }, guest.token)).s === 403, 'khách không tạo được giải');
  const c = await j('POST', '/api/badrally/tournament-create', { name: 'Giải test' }, host.token);
  ok(c.s === 200 && /^\d{6}$/.test(c.j?.code) && c.j?.btcCode?.length >= 8, 'chủ sân tạo giải, nhận code + btcCode: ' + c.s);
  const tid = c.j.id; created.tournaments.push(tid);
  ok(tid === `trn${c.j.code}000000`, 'id giải suy ra từ code');
  ok((await j('POST', '/api/collections/tournaments/records', { name: 'y', code: '123456', hosts: [guest.id] }, guest.token)).s >= 400, 'không tạo giải trực tiếp qua API');

  // --- Đọc ---
  ok((await j('GET', `/api/collections/tournaments/records/${tid}`, null, guest.token)).s === 200, 'khách xem được giải');
  const sec = await j('GET', `/api/collections/tournament_secrets/records?filter=${encodeURIComponent(`tournament="${tid}"`)}`, null, guest.token);
  ok(sec.s === 200 && sec.j.items.length === 0, 'khách không thấy mã BTC');
  const secHost = await j('GET', `/api/collections/tournament_secrets/records?filter=${encodeURIComponent(`tournament="${tid}"`)}`, null, host.token);
  ok(secHost.j?.items?.[0]?.btc_code === c.j.btcCode, 'BTC thấy mã BTC');

  // --- Mã BTC ---
  ok((await j('PATCH', `/api/collections/tournaments/records/${tid}`, { name: 'hack' }, host2.token)).s >= 400, 'chủ sân khác chưa nhập mã thì không sửa được');
  ok((await j('POST', '/api/badrally/tournament-join', { code: c.j.code, btcCode: 'SAI12345' }, host2.token)).s === 400, 'sai mã BTC → 400');
  ok((await j('POST', '/api/badrally/tournament-join', { code: c.j.code, btcCode: c.j.btcCode }, guest.token)).s === 403, 'không có quyền chủ sân → 403');
  ok((await j('POST', '/api/badrally/tournament-join', { code: c.j.code, btcCode: c.j.btcCode }, host2.token)).s === 200, 'đúng mã BTC → vào hosts');
  ok((await j('PATCH', `/api/collections/tournaments/records/${tid}`, { name: 'Giải test 2' }, host2.token)).s === 200, 'BTC thứ 2 sửa được giải');

  // --- Nội dung ---
  ok((await j('POST', '/api/collections/events/records', { tournament: tid, name: 'Đôi nam', category: 'MD', max_entries: 2 }, guest.token)).s >= 400, 'khách không tạo nội dung');
  const md = (await j('POST', '/api/collections/events/records', { tournament: tid, name: 'Đôi nam', category: 'MD', max_entries: 2, format: 'rr', scoring: { games: 1, points: 21, cap: 30 }, stage: 'registration' }, host.token)).j;
  ok(!!md?.id, 'BTC tạo nội dung');

  // --- Đăng ký khi chưa mở ---
  const p = (name, gender, by) => j('POST', '/api/collections/participants/records', { tournament: tid, name, gender, skill: 'Trung bình', users: by ? [by.id] : [] }, (by || guest).token);
  ok((await p('Sớm', 'M', guest)).s >= 400, 'chưa mở đăng ký → không tạo người');
  await j('PATCH', `/api/collections/tournaments/records/${tid}`, { status: 'registration', reg_deadline: new Date(Date.now() + 86400000).toISOString() }, host.token);

  const nam = (await p('Nguyễn  Nam', 'M', guest)).j, hung = (await p('Hùng', 'M')).j, lan = (await p('Lan', 'F')).j;
  ok(nam?.name_key === 'nguyen nam', 'server tính name_key không dấu: ' + nam?.name_key);
  ok((await j('POST', '/api/collections/participants/records', { tournament: tid, name: 'Giả', users: [guest2.id] }, guest.token)).s >= 400, 'không gán tài khoản người khác khi tạo người');

  const e = (p1, p2, extra = {}, by = guest) => j('POST', '/api/collections/entries/records', { event: md.id, p1, p2, ...extra }, by.token);
  ok((await e(nam.id, lan.id)).s >= 400, 'Đôi nam có người nữ → từ chối');
  const e1 = await e(nam.id, hung.id, { status: 'approved', seed: 1, group: 'A', paid: true });
  ok(e1.s === 200 && e1.j.status === 'pending' && !e1.j.seed && !e1.j.group && !e1.j.paid && e1.j.created_by === guest.id, 'khách đăng ký: server đặt pending, bỏ seed/group/paid');
  const tuan = (await p('Tuấn', 'M')).j, minh = (await p('Minh', 'M')).j, an = (await p('An', 'M')).j, binh = (await p('Bình', 'M')).j;
  ok((await e(nam.id, tuan.id)).s >= 400, 'một người không ở 2 đôi cùng nội dung');
  ok((await e(tuan.id, minh.id)).j?.status === 'pending', 'đôi thứ 2 → pending');
  ok((await e(an.id, binh.id)).j?.status === 'waitlist', 'vượt số đôi tối đa → danh sách chờ');

  // --- Nhận tên ---
  const claim = (pid, users, by) => j('PATCH', `/api/collections/participants/records/${pid}`, { users }, by.token);
  ok((await claim(hung.id, [guest2.id], guest2)).s === 200, 'người chưa ai nhận → tự nhận được');
  ok((await claim(hung.id, [], guest)).s >= 400, 'khách không gỡ tài khoản người khác');
  ok((await claim(hung.id, [], host)).s === 200, 'BTC gỡ được tài khoản đã nhận');
  const u3 = await user(), u4 = await user();
  await claim(nam.id, [guest.id, guest2.id], guest2);
  ok((await claim(nam.id, [guest.id, guest2.id, u3.id], u3)).s === 200, 'người thứ 3 nhận được');
  ok((await claim(nam.id, [guest.id, guest2.id, u3.id, u4.id], u4)).s >= 400, 'tối đa 3 tài khoản');
  // Người nhận sau không được sửa hồ sơ của người khác; người tạo tên (tài khoản đầu) sửa được khi còn hạn
  const prof = (body, by) => j('PATCH', `/api/collections/participants/records/${nam.id}`, body, by.token);
  ok((await prof({ name: 'Bị đổi tên' }, u3)).s >= 400, 'người nhận thêm không đổi được tên');
  ok((await prof({ skill: 'Khá+' }, guest2)).s >= 400, 'người nhận thêm không đổi được trình độ');
  ok((await prof({ name: 'Nguyễn Nam' }, guest)).s === 200, 'chủ tên đổi được tên khi còn hạn đăng ký');
  ok((await prof({ gender: 'F' }, guest)).s >= 400, 'không đổi giới tính khi đã có đôi (tránh lách luật đôi nam/nữ)');

  // --- Trận ---
  ok((await j('POST', '/api/collections/matches/records', { event: md.id, stage: 'group', round: 1, order: 0, entry_a: e1.j.id, status: 'pending' }, guest.token)).s >= 400, 'khách không tạo trận');
  const mt = await j('POST', '/api/collections/matches/records', { event: md.id, stage: 'group', round: 1, order: 0, entry_a: e1.j.id, status: 'pending' }, host.token);
  ok(mt.s === 200, 'BTC tạo trận');
  ok((await j('PATCH', `/api/collections/matches/records/${mt.j.id}`, { status: 'done' }, guest.token)).s >= 400, 'khách không sửa trận');
  // Chống ghi cũ đè ghi mới: version gửi lên phải lớn hơn version đang có
  const mpath = `/api/collections/matches/records/${mt.j.id}`;
  ok((await j('PATCH', mpath, { status: 'called', court: 1, version: 1 }, host.token)).s === 200, 'BTC ghi version 1');
  ok((await j('PATCH', mpath, { status: 'done', version: 2 }, host.token)).s === 200, 'BTC ghi version 2');
  const stale = await j('PATCH', mpath, { status: 'called', version: 1 }, host2.token);
  ok(stale.s === 400, 'ghi version cũ (máy BTC khác / gửi lại muộn) bị từ chối: ' + stale.s);
  ok((await j('GET', mpath, null, host.token)).j?.status === 'done', 'trận đã xong không bị lùi về "đang gọi"');
  ok((await j('PATCH', mpath, { entry_b: e1.j.id }, host.token)).s === 200, 'ghi không kèm version (điền nhánh) vẫn được');

  // --- Đôi đã duyệt / nội dung đã bốc thăm / mã giải ---
  await j('PATCH', `/api/collections/entries/records/${e1.j.id}`, { status: 'approved' }, host.token);
  const hai = (await p('Hải', 'M')).j;
  ok((await j('PATCH', `/api/collections/entries/records/${e1.j.id}`, { p2: hai.id }, guest.token)).s >= 400, 'khách không đổi người trong đôi đã được duyệt');
  await j('PATCH', `/api/collections/events/records/${md.id}`, { stage: 'groups' }, host.token);
  const late = (await p('Kiên', 'M')).j, lateB = (await p('Lộc', 'M')).j;
  ok((await e(late.id, lateB.id)).s >= 400, 'không đăng ký vào nội dung đã bốc thăm');
  await j('PATCH', `/api/collections/events/records/${md.id}`, { stage: 'registration' }, host.token);
  ok((await j('PATCH', `/api/collections/tournaments/records/${tid}`, { code: '999999' }, host.token)).s >= 400, 'BTC không đổi được mã giải (id suy từ mã)');

  // --- SĐT ---
  const ct = await j('POST', '/api/collections/contacts/records', { participant: nam.id, phone: '0900000000' }, guest.token);
  ok(ct.s === 200, 'người đăng ký gửi được SĐT');
  ok((await j('GET', `/api/collections/contacts/records/${ct.j.id}`, null, guest2.token)).s === 404, 'người khác không xem được SĐT');
  ok((await j('GET', `/api/collections/contacts/records/${ct.j.id}`, null, host.token)).s === 200, 'BTC xem được SĐT');

  // --- Hết hạn ---
  await j('PATCH', `/api/collections/tournaments/records/${tid}`, { reg_deadline: new Date(Date.now() - 1000).toISOString() }, host.token);
  ok((await p('Muộn', 'M')).s >= 400, 'quá hạn → không đăng ký được');

  ok(await count('rooms') === roomsBefore && await count('players') === playersBefore, 'không đụng tới rooms/players');
} finally {
  for (const id of created.tournaments) await j('DELETE', `/api/collections/tournaments/records/${id}`, null, su);
  for (const id of created.users) await j('DELETE', `/api/collections/users/records/${id}`, null, su);
  console.log(failed ? `${failed} FAIL` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
}
