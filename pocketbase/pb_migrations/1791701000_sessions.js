/// <reference path="../pb_data/types.d.ts" />
// Buổi chơi: kết quả một phòng được lưu lại khi chủ sân thoát (xếp hạng + từng trận).
// Chỉ chủ sân tạo ra mới xem / xóa được, không ai sửa; server tự xóa sau 30 ngày (pb_hooks/sessions.pb.js).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const sessions = new Collection({
    type: "base",
    name: "sessions",
    listRule: "host = @request.auth.id",
    viewRule: "host = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.auth.is_host = true && @request.body.host = @request.auth.id",
    updateRule: null,
    deleteRule: "host = @request.auth.id",
    fields: [
      { type: "relation", name: "host", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "room_name", max: 100 },
      { type: "text", name: "pin", max: 6 },
      { type: "number", name: "started_at", onlyInt: true },
      { type: "number", name: "ended_at", required: true, onlyInt: true },
      { type: "json", name: "data", maxSize: 600000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_sessions_host ON sessions (host, ended_at)"],
  });
  app.save(sessions);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("sessions"));
});
