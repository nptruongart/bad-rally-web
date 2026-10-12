/// <reference path="../pb_data/types.d.ts" />
// Người vào phòng muộn: base_count = số trận "tính sẵn" (trung bình của phòng lúc vào), chỉ dùng cho
// thuật toán xếp trận để họ không được ưu tiên dồn dập. Giá trị do server tính (pb_hooks), khách không tự sửa được.
migrate((app) => {
  const players = app.findCollectionByNameOrId("players");
  players.fields.add(new NumberField({ name: "base_count", onlyInt: true, min: 0 }));
  players.updateRule = players.updateRule.replace(
    "@request.body.play_count:isset = false",
    "@request.body.play_count:isset = false && @request.body.base_count:isset = false");
  app.save(players);
}, (app) => {
  const players = app.findCollectionByNameOrId("players");
  players.updateRule = players.updateRule.replace(" && @request.body.base_count:isset = false", "");
  players.fields.removeByName("base_count");
  app.save(players);
});
