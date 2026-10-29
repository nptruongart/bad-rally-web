// Chuẩn bị PocketBase LOCAL: tài khoản quản trị test + mã mời chủ sân, in link chủ sân để mở trên localhost.
// Dùng (sau khi .\scripts\local-pb.ps1 đang chạy): node scripts/seed-local.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const PB = 'http://127.0.0.1:8090';
const ADMIN_FILE = '.local/admin.json';
const rnd = (n) => randomBytes(n).toString('base64url').slice(0, n);

let admin;
if (existsSync(ADMIN_FILE)) admin = JSON.parse(readFileSync(ADMIN_FILE, 'utf8'));
else {
  admin = { email: 'test-admin@local.test', password: rnd(24) };
  writeFileSync(ADMIN_FILE, JSON.stringify(admin));
}
execFileSync('.local/pocketbase/pocketbase.exe', ['superuser', 'upsert', admin.email, admin.password, '--dir=.local/pb_data'], { stdio: 'ignore' });

const j = async (method, path, body, token) => {
  const r = await fetch(PB + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data;
};

const { token } = await j('POST', '/api/collections/_superusers/auth-with-password', { identity: admin.email, password: admin.password });
const existing = await j('GET', '/api/collections/host_invites/records?perPage=1&filter=' + encodeURIComponent('active=true'), null, token);
const invite = existing.items[0] || await j('POST', '/api/collections/host_invites/records', { code: rnd(24), note: 'local', active: true, max_uses: 0, uses: 0 }, token);
console.log('Link chủ sân (local): http://localhost:3000/?host=' + invite.code);
