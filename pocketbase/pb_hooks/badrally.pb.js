/// <reference path="../pb_data/types.d.ts" />

// Đổi mã mời chủ sân lấy quyền tạo phòng cho tài khoản (thiết bị) đang đăng nhập.
// Mã được quản lý trong collection host_invites (trang quản trị /_/): tắt "active" để thu hồi.
routerAdd("POST", "/api/badrally/redeem-host", (e) => {
  const body = e.requestInfo().body || {};
  const code = String(body.code || "").trim();
  if (code.length < 16) {
    throw new BadRequestError("Mã chủ sân không hợp lệ.");
  }

  let invite;
  try {
    invite = e.app.findFirstRecordByFilter("host_invites", "code = {:code} && active = true", { code: code });
  } catch (_) {
    throw new BadRequestError("Mã chủ sân không đúng hoặc đã bị thu hồi.");
  }

  const maxUses = invite.getInt("max_uses");
  const uses = invite.getInt("uses");
  const user = e.auth;

  if (!user.getBool("is_host")) {
    if (maxUses > 0 && uses >= maxUses) {
      throw new BadRequestError("Mã chủ sân đã hết lượt dùng.");
    }
    user.set("is_host", true);
    e.app.save(user);
    invite.set("uses", uses + 1);
    e.app.save(invite);
  }

  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// Người chơi mới vào phòng → base_count = trung bình số trận (đã tính base) của những người đang chơi
// (không tính người nghỉ). Phòng mới chưa ai đánh thì = 0. Ghi đè mọi giá trị client gửi lên.
onRecordCreate((e) => {
  let base = 0;
  try {
    const others = e.app.findRecordsByFilter("players", "room = {:room} && status != 'break'", "", 0, 0, { room: e.record.getString("room") });
    if (others.length > 0) {
      let sum = 0;
      for (const p of others) sum += p.getInt("play_count") + p.getInt("base_count");
      base = Math.floor(sum / others.length);
    }
  } catch (_) { /* lỗi đọc → coi như 0 */ }
  e.record.set("base_count", base);
  e.next();
}, "players");
