/// <reference path="../pb_data/types.d.ts" />
// Chế độ Giải đấu: tạo giải, nhập mã BTC, kiểm tra đăng ký / nhận tên.
// Mỗi handler chạy trong VM riêng → require tournament_utils.js bên trong handler.

// Tạo giải (chỉ máy có quyền chủ sân). Server sinh mã giải 6 số + mã BTC; người tạo là BTC đầu tiên.
routerAdd("POST", "/api/badrally/tournament-create", (e) => {
  const u = require(`${__hooks}/tournament_utils.js`);
  if (!e.auth.getBool("is_host")) throw new ForbiddenError("Cần quyền chủ sân để tạo giải.");
  const name = String((e.requestInfo().body || {}).name || "").trim().slice(0, 80);
  if (!name) throw new BadRequestError("Thiếu tên giải.");

  let code = "";
  for (let i = 0; i < 20 && !code; i++) {
    const c = String(100000 + Math.floor(Math.random() * 900000));
    let taken = false;
    try { e.app.findFirstRecordByFilter("tournaments", "code = {:c}", { c: c }); taken = true; } catch (_) {}
    try { e.app.findFirstRecordByFilter("rooms", "pin = {:c}", { c: c }); taken = true; } catch (_) {}
    if (!taken) code = c;
  }
  if (!code) throw new BadRequestError("Không tạo được mã giải, thử lại.");

  const btcCode = $security.randomStringWithAlphabet(8, u.BTC_ALPHABET);
  let id = "";
  e.app.runInTransaction((txApp) => {
    const t = new Record(txApp.findCollectionByNameOrId("tournaments"));
    t.set("id", "trn" + code + "000000");
    t.set("code", code);
    t.set("name", name);
    t.set("hosts", [e.auth.id]);
    t.set("status", "draft");
    t.set("courts", [{ id: 1, name: "Sân 1" }, { id: 2, name: "Sân 2" }]);
    t.set("settings", { rest_minutes: 10, walkover_mode: "walkover" });
    txApp.save(t);
    const s = new Record(txApp.findCollectionByNameOrId("tournament_secrets"));
    s.set("tournament", t.id);
    s.set("btc_code", btcCode);
    txApp.save(s);
    id = t.id;
  });
  return e.json(200, { id: id, code: code, btcCode: btcCode });
}, $apis.requireAuth("users"));

// Máy chủ sân khác nhập mã BTC → cùng điều khiển giải (khôi phục khi mất máy, 2 người làm BTC)
routerAdd("POST", "/api/badrally/tournament-join", (e) => {
  if (!e.auth.getBool("is_host")) throw new ForbiddenError("Cần quyền chủ sân.");
  const body = e.requestInfo().body || {};
  const code = String(body.code || "").trim();
  const btcCode = String(body.btcCode || "").trim().toUpperCase();
  let t;
  try { t = e.app.findFirstRecordByFilter("tournaments", "code = {:c}", { c: code }); } catch (_) { throw new BadRequestError("Không tìm thấy giải."); }
  const s = e.app.findFirstRecordByFilter("tournament_secrets", "tournament = {:t}", { t: t.id });
  if (!btcCode || s.getString("btc_code") !== btcCode) throw new BadRequestError("Mã BTC không đúng.");
  const hosts = t.getStringSlice("hosts");
  if (hosts.indexOf(e.auth.id) < 0) {
    hosts.push(e.auth.id);
    t.set("hosts", hosts);
    e.app.save(t);
  }
  return e.json(200, { ok: true, tournamentId: t.id });
}, $apis.requireAuth("users"));

// name_key luôn do server tính (mọi đường tạo/sửa, kể cả BTC)
onRecordCreate((e) => {
  const u = require(`${__hooks}/tournament_utils.js`);
  e.record.set("name_key", u.normalizeName(e.record.getString("name")));
  e.next();
}, "participants");
onRecordUpdate((e) => {
  const u = require(`${__hooks}/tournament_utils.js`);
  e.record.set("name_key", u.normalizeName(e.record.getString("name")));
  e.next();
}, "participants");

// Khách tạo người: giải phải đang mở đăng ký; chỉ được gắn tài khoản của chính mình
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const u = require(`${__hooks}/tournament_utils.js`);
  const t = e.app.findRecordById("tournaments", e.record.getString("tournament"));
  if (!u.isHost(t, e.auth && e.auth.id)) {
    if (!u.registrationOpen(t)) throw new BadRequestError("Giải chưa mở hoặc đã hết hạn đăng ký.");
    const users = e.record.getStringSlice("users");
    if (users.some((x) => x !== e.auth.id)) throw new ForbiddenError("Chỉ được gắn tài khoản của chính mình.");
  }
  e.next();
}, "participants");

// Khách sửa người: chỉ thêm/bỏ chính mình khỏi danh sách tài khoản (nhận tên, tối đa 3 máy).
// Sửa tên/giới tính/trình độ: chỉ tài khoản ĐẦU TIÊN của tên đó (người tạo/nhận đầu), khi còn hạn đăng ký;
// không đổi giới tính khi người đó đã có đôi (tránh lách luật đôi nam/đôi nữ/nam nữ). BTC sửa được mọi lúc.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const u = require(`${__hooks}/tournament_utils.js`);
  const old = e.record.original();
  const t = e.app.findRecordById("tournaments", old.getString("tournament"));
  if (!u.isHost(t, e.auth.id)) {
    if (e.record.getString("tournament") !== old.getString("tournament")) throw new ForbiddenError("Không được đổi giải.");
    const before = old.getStringSlice("users"), after = e.record.getStringSlice("users");
    const added = after.filter((x) => before.indexOf(x) < 0), removed = before.filter((x) => after.indexOf(x) < 0);
    if (added.some((x) => x !== e.auth.id) || removed.some((x) => x !== e.auth.id)) throw new ForbiddenError("Chỉ được nhận hoặc bỏ nhận tên cho chính mình.");
    const profileChanged = ["name", "gender", "skill"].some((f) => e.record.getString(f) !== old.getString(f));
    if (profileChanged) {
      if (before[0] !== e.auth.id) throw new ForbiddenError("Chỉ người tạo tên này mới sửa được thông tin.");
      if (!u.registrationOpen(t)) throw new BadRequestError("Đã hết hạn đăng ký, nhờ BTC sửa.");
      if (e.record.getString("gender") !== old.getString("gender")) {
        const has = e.app.findRecordsByFilter("entries", "status != 'withdrawn' && (p1 = {:p} || p2 = {:p})", "", 1, 0, { p: old.id });
        if (has.length > 0) throw new BadRequestError("Người này đã có đôi, không đổi giới tính được. Nhờ BTC sửa.");
      }
    }
  }
  e.next();
}, "participants");

// Đăng ký đôi
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const u = require(`${__hooks}/tournament_utils.js`);
  const ctx = u.checkEntry(e.app, e.record);
  e.record.set("created_by", e.auth.id);
  if (u.isHost(ctx.tournament, e.auth.id)) {
    if (!e.record.getString("status")) e.record.set("status", "approved");
  } else {
    if (!u.registrationOpen(ctx.tournament)) throw new BadRequestError("Giải chưa mở hoặc đã hết hạn đăng ký.");
    if (ctx.event.getString("format") === "team_rot") throw new BadRequestError("Nội dung đồng đội do BTC nhập danh sách, không đăng ký đôi.");
    const stage = ctx.event.getString("stage");
    if (stage && stage !== "registration") throw new BadRequestError("Nội dung này đã bốc thăm, không nhận đăng ký nữa.");
    const taken = e.app.findRecordsByFilter("entries", "event = {:ev} && (status = 'pending' || status = 'approved')", "", 0, 0, { ev: ctx.event.id }).length;
    e.record.set("status", taken >= ctx.event.getInt("max_entries") ? "waitlist" : "pending");
    e.record.set("seed", 0);
    e.record.set("group", "");
    e.record.set("paid", false);
  }
  e.next();
}, "entries");

// Sửa đôi: khách chỉ sửa đôi mình tạo, khi còn hạn, chỉ đổi người hoặc rút
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const u = require(`${__hooks}/tournament_utils.js`);
  const old = e.record.original();
  const ctx = u.checkEntry(e.app, e.record);
  if (!u.isHost(ctx.tournament, e.auth.id)) {
    if (old.getString("created_by") !== e.auth.id) throw new ForbiddenError("Chỉ sửa được đôi do mình đăng ký.");
    if (!u.registrationOpen(ctx.tournament)) throw new BadRequestError("Đã hết hạn đăng ký.");
    if (e.record.getString("event") !== old.getString("event")) throw new ForbiddenError("Không được đổi nội dung.");
    for (const f of ["seed", "group", "paid", "created_by"]) {
      if (String(e.record.get(f)) !== String(old.get(f))) throw new ForbiddenError("Không được sửa trường " + f + ".");
    }
    const st = e.record.getString("status");
    if (st !== old.getString("status") && st !== "withdrawn") throw new ForbiddenError("Chỉ được rút đôi.");
    const peopleChanged = e.record.getString("p1") !== old.getString("p1") || e.record.getString("p2") !== old.getString("p2");
    if (peopleChanged && old.getString("status") === "approved") throw new ForbiddenError("Đôi đã được duyệt, nhờ BTC đổi người.");
  }
  e.next();
}, "entries");

// SĐT: khách chỉ gửi khi giải còn mở đăng ký
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const u = require(`${__hooks}/tournament_utils.js`);
  const p = e.app.findRecordById("participants", e.record.getString("participant"));
  const t = e.app.findRecordById("tournaments", p.getString("tournament"));
  if (!u.isHost(t, e.auth.id) && !u.registrationOpen(t)) throw new BadRequestError("Đã hết hạn đăng ký.");
  e.next();
}, "contacts");

// Chống ghi cũ đè ghi mới (gửi lại muộn khi mất mạng, hoặc máy BTC khác đang xem dữ liệu cũ):
// nếu request có version thì phải lớn hơn version đang lưu. Ghi không kèm version (điền nhánh) vẫn được.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const body = e.requestInfo().body || {};
  if (body.version !== undefined && body.version !== null) {
    const current = e.record.original().getInt("version");
    if (Number(body.version) <= current) throw new BadRequestError("Trận này vừa được cập nhật ở máy khác. Hãy tải lại.");
  }
  e.next();
}, "matches");

// Mã giải không đổi được (id bản ghi suy ra từ mã → đổi mã là mất đường vào giải)
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  if (e.record.getString("code") !== e.record.original().getString("code")) throw new BadRequestError("Không đổi được mã giải.");
  e.next();
}, "tournaments");
