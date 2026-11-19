# Bad Rally

App xếp trận cầu lông (và tennis, bóng bàn) cho sân và câu lạc bộ. Chủ sân tạo phòng, người chơi quét mã QR để vào. App ghép cặp công bằng, xoay vòng sân, báo tới lượt, ghi tỉ số, xếp hạng và lưu lịch sử buổi chơi. Có chế độ giải đấu.

© 2026 iDean. Bảo lưu mọi quyền.

## Công nghệ

- **Web:** Next.js 16 (xuất tĩnh), React, Tailwind CSS
- **Máy chủ:** PocketBase 0.40.5 (`pocketbase/pb_migrations`, `pocketbase/pb_hooks`), chạy sau Caddy
- **Android:** Capacitor (`com.idean.badrally`)

## Chạy ở máy

```powershell
npm install
.\scripts\local-pb.ps1          # PocketBase local ở http://127.0.0.1:8090 (dữ liệu ở .local/pb_data)
$env:NEXT_PUBLIC_PB_URL = "http://127.0.0.1:8090"; npm run dev
```

- Test: `npm test`
- Chuẩn bị PocketBase local (tài khoản quản trị thử + mã mời chủ sân): `node scripts/seed-local.mjs`

## Deploy

```powershell
.\deploy\deploy.ps1 -Key $env:USERPROFILE\.ssh\badrally-oracle.key
```

Script tự build bản tĩnh rồi đưa lên VPS. Muốn đổi cấu trúc dữ liệu: sao lưu `pb_data` trên server, chép migration hoặc hook mới, rồi khởi động lại PocketBase. Cấu hình server nằm trong `deploy/`.

Không commit thư mục `private/` hay bất kỳ mã mời hoặc mật khẩu nào.
