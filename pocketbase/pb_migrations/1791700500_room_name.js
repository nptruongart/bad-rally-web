/// <reference path="../pb_data/types.d.ts" />
// Tên phòng (vd. "CLB Phú Thọ – tối thứ 3") do chủ sân đặt, hiện cho mọi người trong phòng
migrate((app) => {
  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.fields.add(new TextField({ name: "name", max: 60 }));
  app.save(rooms);
}, (app) => {
  const rooms = app.findCollectionByNameOrId("rooms");
  rooms.fields.removeByName("name");
  app.save(rooms);
});
