/// <reference path="../pb_data/types.d.ts" />
// Chế độ Giải đấu: chỉ THÊM collection mới, không sửa rooms/players/users.
//  tournaments → events (nội dung) → entries (đôi) → matches; participants (người) dùng chung mọi nội dung;
//  tournament_secrets (mã BTC) và contacts (SĐT) chỉ BTC của giải đọc được.
// Quan hệ tới users KHÔNG cascadeDelete (xóa tài khoản không làm mất dữ liệu giải).
// Kiểm tra phức tạp (đăng ký, nhận tên) nằm trong pb_hooks/tournament.pb.js.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const AUTH = "@request.auth.id != ''";
  const auto = [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  const tournaments = new Collection({
    type: "base",
    name: "tournaments",
    listRule: "hosts.id ?= @request.auth.id",
    viewRule: AUTH,
    createRule: null, // chỉ tạo qua route /api/badrally/tournament-create
    updateRule: "hosts.id ?= @request.auth.id",
    deleteRule: null,
    fields: [
      { type: "text", name: "code", required: true, min: 6, max: 6, pattern: "^[0-9]{6}$" },
      { type: "text", name: "name", required: true, max: 80 },
      { type: "relation", name: "hosts", collectionId: users.id, maxSelect: 10, cascadeDelete: false },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["draft", "registration", "closed", "running", "finished"] },
      { type: "date", name: "reg_deadline" },
      { type: "json", name: "courts", maxSize: 20000 },
      { type: "json", name: "settings", maxSize: 20000 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tournaments_code ON tournaments (code)"],
  });
  app.save(tournaments);

  const HOST_T = "tournament.hosts.id ?= @request.auth.id";
  const secrets = new Collection({
    type: "base",
    name: "tournament_secrets",
    listRule: HOST_T,
    viewRule: HOST_T,
    createRule: null,
    updateRule: HOST_T + " && @request.body.tournament:isset = false",
    deleteRule: null,
    fields: [
      { type: "relation", name: "tournament", required: true, collectionId: tournaments.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "btc_code", required: true, min: 6, max: 20 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tsecrets_t ON tournament_secrets (tournament)"],
  });
  app.save(secrets);

  const events = new Collection({
    type: "base",
    name: "events",
    listRule: AUTH,
    viewRule: AUTH,
    createRule: "@request.body.tournament.hosts.id ?= @request.auth.id",
    updateRule: HOST_T + " && @request.body.tournament:isset = false",
    deleteRule: HOST_T,
    fields: [
      { type: "relation", name: "tournament", required: true, collectionId: tournaments.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 60 },
      { type: "select", name: "category", required: true, maxSelect: 1, values: ["MD", "WD", "XD", "open"] },
      { type: "number", name: "max_entries", onlyInt: true, min: 2, max: 12 },
      { type: "select", name: "format", maxSelect: 1, values: ["rr", "groups_ko"] },
      { type: "number", name: "groups", onlyInt: true, min: 0, max: 4 },
      { type: "number", name: "advance", onlyInt: true, min: 0, max: 2 },
      { type: "json", name: "scoring", maxSize: 2000 },
      { type: "select", name: "stage", maxSelect: 1, values: ["registration", "drawn", "groups", "ko", "done"] },
      { type: "number", name: "order", onlyInt: true },
      ...auto,
    ],
  });
  app.save(events);

  const participants = new Collection({
    type: "base",
    name: "participants",
    listRule: AUTH,
    viewRule: AUTH,
    createRule: AUTH, // hook: còn hạn đăng ký, chỉ được gắn tài khoản của chính mình
    updateRule: AUTH, // hook: khách chỉ tự nhận / bỏ nhận tên, sửa tên của mình
    deleteRule: HOST_T,
    fields: [
      { type: "relation", name: "tournament", required: true, collectionId: tournaments.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, min: 1, max: 40 },
      { type: "text", name: "name_key", max: 60 },
      { type: "select", name: "gender", maxSelect: 1, values: ["M", "F"] },
      { type: "text", name: "skill", max: 20 },
      { type: "relation", name: "users", collectionId: users.id, maxSelect: 3, cascadeDelete: false },
      ...auto,
    ],
  });
  app.save(participants);

  const contacts = new Collection({
    type: "base",
    name: "contacts",
    listRule: "participant.tournament.hosts.id ?= @request.auth.id",
    viewRule: "participant.tournament.hosts.id ?= @request.auth.id",
    createRule: AUTH,
    updateRule: "participant.tournament.hosts.id ?= @request.auth.id",
    deleteRule: "participant.tournament.hosts.id ?= @request.auth.id",
    fields: [
      { type: "relation", name: "participant", required: true, collectionId: participants.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "phone", max: 20 },
      ...auto,
    ],
  });
  app.save(contacts);

  const entries = new Collection({
    type: "base",
    name: "entries",
    listRule: AUTH,
    viewRule: AUTH,
    createRule: AUTH, // hook: hạn đăng ký, giới tính, trùng người, danh sách chờ
    updateRule: AUTH, // hook: khách chỉ sửa/rút đôi mình tạo khi còn hạn
    deleteRule: "event.tournament.hosts.id ?= @request.auth.id",
    fields: [
      { type: "relation", name: "event", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "p1", required: true, collectionId: participants.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "p2", required: true, collectionId: participants.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "status", maxSelect: 1, values: ["pending", "approved", "waitlist", "withdrawn"] },
      { type: "number", name: "seed", onlyInt: true, min: 0 },
      { type: "text", name: "group", max: 1 },
      { type: "bool", name: "paid" },
      { type: "relation", name: "created_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...auto,
    ],
  });
  app.save(entries);

  const HOST_E = "event.tournament.hosts.id ?= @request.auth.id";
  const matches = new Collection({
    type: "base",
    name: "matches",
    listRule: AUTH,
    viewRule: AUTH,
    createRule: "@request.body.event.tournament.hosts.id ?= @request.auth.id",
    updateRule: HOST_E + " && @request.body.event:isset = false",
    deleteRule: HOST_E,
    fields: [
      { type: "relation", name: "event", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "stage", required: true, maxSelect: 1, values: ["group", "ko"] },
      { type: "text", name: "group", max: 1 },
      { type: "number", name: "round", onlyInt: true },
      { type: "number", name: "order", onlyInt: true },
      { type: "relation", name: "entry_a", collectionId: entries.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "entry_b", collectionId: entries.id, maxSelect: 1, cascadeDelete: false },
      { type: "json", name: "feeds", maxSize: 2000 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "ready", "called", "playing", "done", "walkover"] },
      { type: "number", name: "court", onlyInt: true },
      { type: "json", name: "scores", maxSize: 2000 },
      { type: "select", name: "winner", maxSelect: 1, values: ["a", "b"] },
      { type: "number", name: "called_at", onlyInt: true },
      { type: "number", name: "finished_at", onlyInt: true },
      { type: "json", name: "log", maxSize: 50000 },
      { type: "number", name: "version", onlyInt: true, min: 0 },
      ...auto,
    ],
  });
  app.save(matches);
}, (app) => {
  for (const name of ["matches", "entries", "contacts", "participants", "events", "tournament_secrets", "tournaments"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* chưa có */ }
  }
});
