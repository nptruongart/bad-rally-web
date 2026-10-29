// Hàm dùng chung cho tournament.pb.js. Mỗi handler PocketBase chạy trong VM riêng nên phải
// require file này BÊN TRONG handler: const u = require(`${__hooks}/tournament_utils.js`)
// (tên file không kết thúc bằng .pb.js nên PocketBase không tự nạp như một hook).

// Bỏ dấu tiếng Việt, hạ chữ, gộp khoảng trắng → dùng để tìm/gợi ý tên, tránh tạo trùng người
function normalizeName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function isHost(tournament, authId) {
  return !!authId && tournament.getStringSlice("hosts").indexOf(authId) >= 0;
}

// Giải đang mở đăng ký và chưa quá hạn
function registrationOpen(tournament) {
  if (tournament.getString("status") !== "registration") return false;
  const d = tournament.getDateTime("reg_deadline");
  return d.isZero() || d.unix() * 1000 > Date.now();
}

// Kiểm tra một đôi: 2 người khác nhau, cùng giải với nội dung, đúng giới tính, không ở đôi khác cùng nội dung
function checkEntry(app, entry) {
  const event = app.findRecordById("events", entry.getString("event"));
  const p1 = app.findRecordById("participants", entry.getString("p1"));
  const p2 = app.findRecordById("participants", entry.getString("p2"));
  const tid = event.getString("tournament");
  if (p1.id === p2.id) throw new BadRequestError("Hai người trong đôi phải khác nhau.");
  if (p1.getString("tournament") !== tid || p2.getString("tournament") !== tid) throw new BadRequestError("Người chơi không thuộc giải này.");
  const g = [p1.getString("gender"), p2.getString("gender")];
  const cat = event.getString("category");
  if (cat === "MD" && (g[0] !== "M" || g[1] !== "M")) throw new BadRequestError("Đôi nam chỉ gồm 2 nam.");
  if (cat === "WD" && (g[0] !== "F" || g[1] !== "F")) throw new BadRequestError("Đôi nữ chỉ gồm 2 nữ.");
  if (cat === "XD" && !((g[0] === "M" && g[1] === "F") || (g[0] === "F" && g[1] === "M"))) throw new BadRequestError("Nam nữ phải gồm 1 nam và 1 nữ.");
  const others = app.findRecordsByFilter("entries",
    "event = {:ev} && status != 'withdrawn' && id != {:self} && (p1 = {:a} || p2 = {:a} || p1 = {:b} || p2 = {:b})",
    "", 1, 0, { ev: event.id, self: entry.id || "", a: p1.id, b: p2.id });
  if (others.length > 0) throw new BadRequestError("Một người chỉ được ở một đôi trong mỗi nội dung.");
  return { event: event, tournament: app.findRecordById("tournaments", tid) };
}

const BTC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

module.exports = { normalizeName, isHost, registrationOpen, checkEntry, BTC_ALPHABET };
