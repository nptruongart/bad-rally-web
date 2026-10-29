/// <reference path="../pb_data/types.d.ts" />
// Bảo mật: trước đây mọi tài khoản đăng nhập đều xem/list được người chơi của MỌI phòng.
// Giờ chỉ chủ phòng và người đã có tên trong phòng đó mới xem được danh sách người chơi của phòng.
// (Khách mới vào phòng vẫn tự tìm được bản ghi của chính mình nhờ điều kiện user = @request.auth.id.)
migrate((app) => {
  const players = app.findCollectionByNameOrId("players");
  const memberRule =
    "@request.auth.id != '' && (user = @request.auth.id || room.host = @request.auth.id" +
    " || (@collection.players:me.room ?= room && @collection.players:me.user ?= @request.auth.id))";
  players.listRule = memberRule;
  players.viewRule = memberRule;
  app.save(players);
}, (app) => {
  const players = app.findCollectionByNameOrId("players");
  players.listRule = "@request.auth.id != ''";
  players.viewRule = "@request.auth.id != ''";
  app.save(players);
});
