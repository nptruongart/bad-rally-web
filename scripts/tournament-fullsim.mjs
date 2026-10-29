// Mô phỏng trọn một ngày giải trên PocketBase LOCAL bằng đúng logic của app (lib/tournament), kiểm tra bất biến.
// Dùng: node --experimental-strip-types --no-warnings scripts/tournament-fullsim.mjs
// Kiểm tra: không ai bị gọi vào 2 sân cùng lúc; luôn đủ thời gian nghỉ khi gọi theo gợi ý; mọi nội dung kết thúc;
// nhánh điền đúng theo bảng xếp hạng; mỗi đôi đánh đủ số trận vòng bảng.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { drawGroups, GROUP_KEYS } from '../lib/tournament/draw.ts';
import { buildEventMatches, fillKoFromGroups } from '../lib/tournament/bracket.ts';
import { planQueue } from '../lib/tournament/dispatch.ts';
import { callMatch, saveScore } from '../lib/tournament/actions.ts';
import { groupStandings } from '../lib/tournament/view.ts';
import { toEvent, toMatch, toEntry, toTournament } from '../lib/tournament/store.ts';

const PB = 'http://127.0.0.1:8090';
const rnd = (n = 12) => randomBytes(n).toString('hex').slice(0, n);
const j = async (method, path, body, token) => {
  const r = await fetch(PB + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data;
};
let fails = 0;
const check = (c, msg) => { if (!c) { fails++; console.log('FAIL ' + msg); } };

const admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
const su = (await j('POST', '/api/collections/_superusers/auth-with-password', { identity: admin.email, password: admin.password })).token;
const email = `test-sim-${rnd()}@anon.badrally.app`, password = rnd(20);
const u = await j('POST', '/api/collections/users/records', { email, password, passwordConfirm: password });
await j('PATCH', `/api/collections/users/records/${u.id}`, { is_host: true }, su);
const host = (await j('POST', '/api/collections/users/auth-with-password', { identity: email, password })).token;

const t = await j('POST', '/api/badrally/tournament-create', { name: 'Giải mô phỏng trọn ngày' }, host);
await j('PATCH', `/api/collections/tournaments/records/${t.id}`, { status: 'running', courts: [{ id: 1, name: 'Sân 5' }, { id: 2, name: 'Sân 6' }, { id: 3, name: 'Sân 7' }] }, host);
const person = async (name, gender) => (await j('POST', '/api/collections/participants/records', { tournament: t.id, name, gender, skill: 'Trung bình' }, host)).id;
const M = [], F = [];
for (let i = 0; i < 14; i++) M.push(await person(`Nam${i + 1}`, 'M'));
for (let i = 0; i < 13; i++) F.push(await person(`Nữ${i + 1}`, 'F'));
const ev = async (name, category, scoring) => j('POST', '/api/collections/events/records', { tournament: t.id, name, category, max_entries: 12, scoring, stage: 'registration', order: 0 }, host);
const md = await ev('Đôi nam', 'MD', { games: 1, points: 21, cap: 30 });
const wd = await ev('Đôi nữ', 'WD', { games: 3, points: 15, cap: 21 });
const xd = await ev('Nam nữ', 'XD', { games: 1, points: 21, cap: 30 });
const entry = async (event, p1, p2) => (await j('POST', '/api/collections/entries/records', { event: event.id, p1, p2, status: 'approved' }, host)).id;
const mdE = [], wdE = [], xdE = [];
for (let i = 0; i < 7; i++) mdE.push(await entry(md, M[i * 2], M[i * 2 + 1]));
for (let i = 0; i < 4; i++) wdE.push(await entry(wd, F[i * 2], F[i * 2 + 1]));
// 3 nam (Nam1, Nam3, Nam5) đánh cả Đôi nam và Nam nữ
for (let i = 0; i < 5; i++) xdE.push(await entry(xd, i < 3 ? M[i * 2] : M[9 + i], F[8 + i]));

// Bốc thăm + công bố như BtcDraw
const publish = async (event, ids, format) => {
  const groups = format === 'rr' ? { A: ids } : drawGroups(ids.map(id => ({ id })), 2, Math.random);
  const keys = format === 'rr' ? ['A'] : ['A', 'B'];
  for (const k of keys) for (const id of groups[k]) await j('PATCH', `/api/collections/entries/records/${id}`, { group: k }, host);
  for (const s of buildEventMatches({ format, groups, groupCount: 2, advance: 2 })) {
    await j('POST', '/api/collections/matches/records', { event: event.id, stage: s.stage, group: s.group, round: s.round, order: s.order, entry_a: s.entryA, entry_b: s.entryB, feeds: s.feeds, status: 'pending', version: 0, scores: [], log: [] }, host);
  }
  await j('PATCH', `/api/collections/events/records/${event.id}`, { format, groups: format === 'rr' ? 1 : 2, advance: format === 'rr' ? 0 : 2, stage: 'groups' }, host);
};
await publish(md, mdE, 'groups_ko');
await publish(wd, wdE, 'rr');
await publish(xd, xdE, 'rr');

const load = async () => {
  const f = encodeURIComponent(`event.tournament="${t.id}"`);
  const [tt, events, entries, matches] = await Promise.all([
    j('GET', `/api/collections/tournaments/records/${t.id}`, null, host),
    j('GET', `/api/collections/events/records?perPage=50&filter=${encodeURIComponent(`tournament="${t.id}"`)}`, null, host),
    j('GET', `/api/collections/entries/records?perPage=200&filter=${f}`, null, host),
    j('GET', `/api/collections/matches/records?perPage=500&filter=${f}`, null, host),
  ]);
  return { t: toTournament(tt), events: events.items.map(toEvent), entries: entries.items.map(toEntry), matches: matches.items.map(toMatch) };
};
const apply = async patches => { for (const p of patches) await j('PATCH', `/api/collections/${p.collection}/records/${p.id}`, p.fields, host); };

// Ngày thi đấu: thời gian giả lập, mỗi trận 12–20 phút
let now = Date.now();
const REST = 10 * 60000;
const endAt = new Map();
let calls = 0, guard = 0;
while (guard++ < 400) {
  const d = await load();
  const people = Object.fromEntries(d.entries.map(e => [e.id, [e.p1, e.p2]]));
  // Điền nhánh khi vòng bảng của Đôi nam xong
  const mdM = d.matches.filter(m => m.event === md.id);
  if (mdM.filter(m => m.stage === 'group').every(m => m.status === 'done') && mdM.some(m => m.stage === 'ko' && !m.entryA && m.round === 1)) {
    const mdEv = d.events.find(e => e.id === md.id);
    const standings = Object.fromEntries(['A', 'B'].map(g => [g, groupStandings(mdEv, g, d.entries, mdM, 'walkover').map(r => r.entry)]));
    await apply(fillKoFromGroups(mdM.filter(m => m.stage === 'ko'), standings).map(x => ({ collection: 'matches', id: x.id, fields: { entry_a: x.entryA, entry_b: x.entryB } })));
    check(true, '');
    continue;
  }
  // Gọi trận gợi ý vào sân trống
  const busyCourts = new Set(d.matches.filter(m => m.status === 'called').map(m => m.court));
  const free = d.t.courts.filter(c => !busyCourts.has(c.id));
  const { ready } = planQueue({ matches: d.matches, people, now, restMs: REST });
  if (free.length && ready.length) {
    const m = ready[0];
    // Bất biến: không ai trong trận này đang ở sân khác, và đã nghỉ đủ
    const onCourt = new Set(d.matches.filter(x => x.status === 'called').flatMap(x => [...people[x.entryA], ...people[x.entryB]]));
    const ps = [...people[m.entryA], ...people[m.entryB]];
    check(ps.every(p => !onCourt.has(p)), `gọi trùng người: ${m.id}`);
    for (const p of ps) {
      const last = Math.max(0, ...d.matches.filter(x => x.status === 'done' && [...people[x.entryA], ...people[x.entryB]].includes(p)).map(x => x.finishedAt));
      check(last === 0 || now - last >= REST, `chưa nghỉ đủ: ${p}`);
    }
    await apply([callMatch(m, free[0].id, now)]);
    endAt.set(m.id, now + (12 + Math.floor(Math.random() * 9)) * 60000);
    calls++;
    continue;
  }
  // Không gọi được thêm → tua tới trận xong sớm nhất và nhập tỉ số
  const playing = d.matches.filter(m => m.status === 'called').sort((a, b) => endAt.get(a.id) - endAt.get(b.id));
  if (playing.length === 0) {
    if (ready.length && !free.length) continue;
    if (d.matches.some(m => m.status !== 'done' && m.entryA && m.entryB)) { now += 60000; continue; } // chờ hết thời gian nghỉ
    break;
  }
  const m = playing[0];
  now = Math.max(now, endAt.get(m.id));
  const rule = d.events.find(e => e.id === m.event).scoring;
  const aWins = Math.random() < 0.5;
  const g = (w) => (w ? [rule.points, rule.points - 3 - Math.floor(Math.random() * 8)] : [rule.points - 5, rule.points]);
  const scores = rule.games === 1 ? [g(aWins)] : [g(aWins), g(!aWins), g(aWins)];
  const r = saveScore({ match: m, scores, rule, eventMatches: d.matches.filter(x => x.event === m.event), uid: u.id, now });
  check(!r.error && !r.needsConfirm, `lưu tỉ số lỗi ${m.id}: ${r.error}`);
  await apply(r.patches);
}

const d = await load();
check(d.events.find(e => e.id === md.id).stage === 'done', 'Đôi nam phải kết thúc (chung kết xong)');
check(d.matches.every(m => m.status === 'done'), 'mọi trận phải xong');
check(d.matches.filter(m => m.event === md.id).length === 12 || d.matches.filter(m => m.event === md.id).length === 12, 'Đôi nam 12 trận');
check(d.matches.filter(m => m.event === wd.id).length === 6, 'Đôi nữ 6 trận');
check(d.matches.filter(m => m.event === xd.id).length === 10, 'Nam nữ 10 trận');
for (const e of [...wdE, ...xdE]) {
  const n = d.matches.filter(m => m.stage === 'group' && (m.entryA === e || m.entryB === e)).length;
  check(n === (wdE.includes(e) ? 3 : 4), `số trận vòng tròn của ${e}: ${n}`);
}
const ko = d.matches.filter(m => m.event === md.id && m.stage === 'ko').sort((a, b) => a.round - b.round || a.order - b.order);
const mdEvent = d.events.find(e => e.id === md.id);
const st = Object.fromEntries(['A', 'B'].map(g => [g, groupStandings(mdEvent, g, d.entries, d.matches.filter(m => m.event === md.id), 'walkover').map(r => r.entry)]));
check(ko[0].entryA === st.A[0] && ko[0].entryB === st.B[1] && ko[1].entryA === st.B[0] && ko[1].entryB === st.A[1], 'bán kết chéo A1–B2, B1–A2');
const winner = (m) => (m.winner === 'a' ? m.entryA : m.entryB);
check(ko[2].entryA === winner(ko[0]) && ko[2].entryB === winner(ko[1]), 'chung kết = 2 đội thắng bán kết');
const hours = ((now - (now - 0)) / 3600000);
console.log(`Mã giải: ${t.code} · ${d.matches.length} trận · ${calls} lần gọi · ${fails ? fails + ' FAIL' : 'ALL PASS'}`);
void hours;
process.exitCode = fails ? 1 : 0;
