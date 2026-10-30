/// <reference path="../pb_data/types.d.ts" />
// Thể thức "Đồng đội xoay cặp" (team_rot): các đội N người, cặp trong đội xoay vòng, xếp hạng theo tổng điểm
migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  events.fields.getByName("format").values = ["rr", "groups_ko", "team_rot"];
  app.save(events);
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  events.fields.getByName("format").values = ["rr", "groups_ko"];
  app.save(events);
});
