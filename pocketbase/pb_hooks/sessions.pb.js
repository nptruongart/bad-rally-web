/// <reference path="../pb_data/types.d.ts" />

// Mỗi đêm 3h (giờ server) xóa các buổi chơi đã lưu quá 30 ngày (khớp SESSION_TTL_DAYS trong lib/session.ts)
cronAdd("badrally_sessions_cleanup", "0 3 * * *", () => {
  const cutoff = Date.now() - 30 * 86400000;
  let total = 0;
  for (;;) {
    const old = $app.findRecordsByFilter("sessions", "ended_at < {:cutoff}", "ended_at", 200, 0, { cutoff: cutoff });
    if (!old.length) break;
    for (const r of old) { $app.delete(r); total++; }
  }
  if (total) console.log("[sessions] đã xóa " + total + " buổi chơi quá 30 ngày");
});
