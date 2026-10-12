/// <reference path="../pb_data/types.d.ts" />
// Schema Bad Rally:
//  - rooms:   1 bản ghi / phòng. id = "room" + PIN + "00000" để khách mở thẳng bằng PIN (không cần quyền list).
//  - players: 1 bản ghi / người chơi → khách vào phòng không ghi đè dữ liệu của nhau.
// Quyền: chỉ chủ phòng (host) sửa phòng / xếp trận / sửa số trận; khách chỉ tự đăng ký và tự bật nghỉ.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const rooms = new Collection({
    type: "base",
    name: "rooms",
    listRule: "host = @request.auth.id",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != '' && @request.body.host = @request.auth.id",
    updateRule: "host = @request.auth.id && (@request.body.host:isset = false || @request.body.host = @request.auth.id)",
    deleteRule: "host = @request.auth.id",
    fields: [
      { type: "text", name: "pin", required: true, min: 6, max: 6, pattern: "^[0-9]{6}$" },
      { type: "relation", name: "host", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "json", name: "settings", maxSize: 20000 },
      { type: "json", name: "courts", maxSize: 50000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_rooms_pin ON rooms (pin)"],
  });
  app.save(rooms);

  const guestCreate =
    "@request.body.user = @request.auth.id && @request.body.status = 'waiting'" +
    " && @request.body.play_count:isset = false && @request.body.wins:isset = false && @request.body.partner:isset = false";
  const guestUpdate =
    "user = @request.auth.id && status != 'playing'" +
    " && @request.body.room:isset = false && @request.body.user:isset = false && @request.body.partner:isset = false" +
    " && @request.body.play_count:isset = false && @request.body.wins:isset = false" +
    " && (@request.body.status:isset = false || @request.body.status != 'playing')";

  const players = new Collection({
    type: "base",
    name: "players",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != '' && (@request.body.room.host = @request.auth.id || (" + guestCreate + "))",
    updateRule: "@request.auth.id != '' && (room.host = @request.auth.id || (" + guestUpdate + "))",
    deleteRule: "@request.auth.id != '' && (room.host = @request.auth.id || user = @request.auth.id)",
    fields: [
      { type: "relation", name: "room", required: true, collectionId: rooms.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: false, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "name", required: true, min: 1, max: 40 },
      { type: "text", name: "skill", max: 20 },
      { type: "select", name: "gender", maxSelect: 1, values: ["M", "F"] },
      { type: "number", name: "play_count", onlyInt: true, min: 0 },
      { type: "number", name: "wins", onlyInt: true, min: 0 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["waiting", "playing", "break"] },
      { type: "text", name: "partner", max: 15 },
      // thời điểm bắt đầu chờ (ms) → ai chờ lâu hơn được ưu tiên khi bằng số trận
      { type: "number", name: "wait_since", onlyInt: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_players_room ON players (room)",
      "CREATE UNIQUE INDEX idx_players_room_user ON players (room, user) WHERE user != ''",
    ],
  });
  app.save(players);

  const settings = app.settings();
  settings.meta.appName = "Bad Rally";
  settings.meta.appURL = "https://146-235-22-130.sslip.io";
  settings.batch.enabled = true;
  settings.batch.maxRequests = 100;
  settings.rateLimits.enabled = true;
  app.save(settings);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("players"));
  app.delete(app.findCollectionByNameOrId("rooms"));
});
