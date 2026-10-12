/// <reference path="../pb_data/types.d.ts" />
// Quyền chủ sân: chỉ tài khoản có is_host = true mới tạo được phòng.
// is_host chỉ được bật qua route /api/badrally/redeem-host (pb_hooks) khi nhập đúng mã mời chủ sân.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "is_host" }));
  // Người dùng không được tự bật is_host khi đăng ký / sửa hồ sơ
  users.createRule = "@request.body.is_host:isset = false";
  users.updateRule = "id = @request.auth.id && @request.body.is_host:isset = false";
  app.save(users);

  // Mã mời chủ sân — chỉ quản trị viên (superuser) xem/sửa được trong trang /_/
  const invites = new Collection({
    type: "base",
    name: "host_invites",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "code", required: true, min: 16, max: 64 },
      { type: "text", name: "note", max: 200 },
      { type: "bool", name: "active" },
      { type: "number", name: "max_uses", onlyInt: true, min: 0 }, // 0 = không giới hạn
      { type: "number", name: "uses", onlyInt: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_host_invites_code ON host_invites (code)"],
  });
  app.save(invites);

  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.createRule = "@request.auth.id != '' && @request.auth.is_host = true && @request.body.host = @request.auth.id";
  app.save(rooms);
}, (app) => {
  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.createRule = "@request.auth.id != '' && @request.body.host = @request.auth.id";
  app.save(rooms);
  app.delete(app.findCollectionByNameOrId("host_invites"));
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("is_host");
  users.createRule = "";
  users.updateRule = "id = @request.auth.id";
  app.save(users);
});
