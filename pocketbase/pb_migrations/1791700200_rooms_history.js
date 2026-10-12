/// <reference path="../pb_data/types.d.ts" />
// Lịch sử trận đấu của phòng (ai đánh với ai) → thuật toán tránh trùng đồng đội / đối thủ, giữ cặp
migrate((app) => {
  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.fields.add(new JSONField({ name: "history", maxSize: 500000 }));
  app.save(rooms);
}, (app) => {
  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.fields.removeByName("history");
  app.save(rooms);
});
