# Bad Rally – App xếp trận cầu lông

Next.js (xuất web tĩnh `out/`) + Capacitor (Android) + PocketBase (backend, realtime).

## Lệnh thường dùng

```bash
npm install
npm run dev      # chạy thử ở http://localhost:3000
npm run build    # build web tĩnh vào out/ (tự tạo lại bộ icon trước khi build)
npm test         # test thuật toán xếp trận (Node ≥ 22.6)
npm run lint
```

Deploy web: `.\deploy\deploy.ps1 -Key C:\duong\dan\ssh-key.key`

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `app/page.tsx` | Bộ điều khiển: trạng thái phòng, đồng bộ realtime, xử lý thao tác |
| `app/components/` | Giao diện: màn hình khởi động, vào phòng, sân, người chơi, cài đặt… |
| `app/hooks/useStableHandlers.ts` | Giữ hàm xử lý cố định để các thẻ đã memo không vẽ lại vô ích |
| `app/fa/` | Bộ icon Font Awesome rút gọn — **tự sinh**, đừng sửa tay |
| `lib/matchmaking.ts` (+ `.test.ts`) | Thuật toán xếp trận |
| `lib/types.ts`, `lib/i18n.ts` | Kiểu dữ liệu, hằng số, từ điển VI/EN |
| `lib/pb.ts` | Kết nối PocketBase, tài khoản ẩn danh, mã chủ sân |
| `pocketbase/` | Migration + hook của server (chép lên `/opt/pocketbase/` trên VPS) |
| `deploy/` | Caddyfile, script cài VPS, service PocketBase, script deploy |
| `scripts/build-icons.mjs` | Tạo bộ icon rút gọn từ các class `fa-*` có trong mã |

## Icon

Dùng icon Font Awesome như bình thường (`<i className="fa-solid fa-ten-icon" />`). Trước mỗi lần `dev`/`build`,
`scripts/build-icons.mjs` quét mã nguồn và chỉ đóng gói các icon đang dùng. Nếu tên icon được ghép động
(vd. `` `fa-chevron-${x}` ``), thêm tên đầy đủ vào mảng `EXTRA` trong script.

## Đổi tên miền

- Web/app: biến `NEXT_PUBLIC_APP_URL` khi build (hoặc tham số `-AppUrl` của `deploy.ps1`).
- Caddy: biến môi trường `BADRALLY_DOMAIN` (xem đầu `deploy/Caddyfile`).
