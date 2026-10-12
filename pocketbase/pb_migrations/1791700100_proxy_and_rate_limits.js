/// <reference path="../pb_data/types.d.ts" />
// PocketBase chạy sau Caddy → phải tin header X-Forwarded-For, nếu không mọi người dùng đều là 127.0.0.1
// và dùng chung 1 hạn mức. Nới hạn mức vì cả nhóm ở sân thường dùng chung 1 wifi (chung IP).
migrate((app) => {
  const settings = app.settings();
  settings.trustedProxy.headers = ["X-Forwarded-For"];
  settings.trustedProxy.useLeftmostIP = false;
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "*:auth", audience: "", duration: 10, maxRequests: 40 },
    { label: "*:create", audience: "", duration: 10, maxRequests: 80 },
    { label: "/api/batch", audience: "", duration: 1, maxRequests: 10 },
    { label: "/api/", audience: "", duration: 10, maxRequests: 600 },
  ];
  app.save(settings);
}, () => {});
