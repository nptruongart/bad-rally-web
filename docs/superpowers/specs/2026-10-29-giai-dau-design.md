# Thiết kế: chế độ Giải đấu cho Bad Rally

Ngày: 2026-10-29 · Nhánh: `giai-dau` (tách từ `main` = bản 16/10 đang chạy trên server)

## 1. Mục đích và lý do

Bad Rally đang dùng tốt cho buổi đánh vãng lai (xếp trận xoay vòng). Chủ sân muốn dùng cùng app để **tổ chức giải phong trào cấp CLB**: các đôi đăng ký qua link trước vài ngày, BTC bốc thăm chia bảng, ngày thi đấu app gọi trận ra sân, BTC nhập tỉ số, mọi người xem bảng xếp hạng và nhánh đấu trực tiếp trên điện thoại.

Lý do tích hợp vào Bad Rally thay vì dùng phần mềm giải có sẵn: dùng chung quyền chủ sân, QR, nút quét QR trong app, báo "tới lượt" bằng chuông/rung, tên sân, tiếng Việt và đúng thói quen giải phong trào.

**Mốc thời gian:** giải thật đầu tiên khoảng **2 tuần** nữa (~2026-11-12). Cần có bản chạy được để **thử một giải nhỏ 3–4 ngày trước đó**.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu (đợt 1)**
- Một **Giải** có nhiều **Nội dung** (vd. Đôi nam, Đôi nữ, Nam nữ, Đôi nam B), dùng chung các sân.
- Mỗi nội dung 4–12 đôi; thể thức **vòng tròn** hoặc **vòng bảng → loại trực tiếp**; luật điểm tùy chỉnh.
- Đăng ký qua link/QR trước giải; BTC duyệt, khóa đăng ký, bốc thăm có hạt giống.
- Ngày thi đấu: hàng đợi gọi trận chung cho mọi nội dung, chặn trùng người, có thời gian nghỉ; báo "tới lượt" cho cả 2 người của mỗi đôi.
- BTC nhập tỉ số; bảng xếp hạng theo luật BWF; nhánh loại trực tiếp tự điền đội thắng.
- Trang xem công khai (ai có mã/QR giải là xem được lịch, bảng, nhánh).

**Không làm ở đợt 1** (để sau): giờ kết thúc dự kiến, xuất ảnh kết quả, màn hình TV, trọng tài nhập điểm từng quả, đánh đơn, phân quyền BTC nhiều cấp, thanh toán lệ phí online, tranh hạng ba (mặc định đồng hạng ba).

**Thất bại nếu** (dù chạy đúng kỹ thuật):
- Làm hỏng hoặc thay đổi hành vi chế độ xếp trận vãng lai đang chạy ổn định.
- Mất dữ liệu giải (tỉ số, danh sách) do xóa tài khoản, mất mạng, bấm nhầm.
- Gọi một người vào 2 sân cùng lúc, hoặc xếp hạng sai luật gây tranh cãi.
- BTC phải thao tác nhiều hơn làm bằng giấy bút + Zalo.

## 3. Ràng buộc

- Next.js 16.3.6 `output: 'export'` (web tĩnh) + PocketBase v0.40.5 trên VPS Oracle (Caddy). Đọc `node_modules/next/dist/docs/` trước khi viết code Next (AGENTS.md).
- Server đang chạy bản 16/10; **mọi migration chỉ thêm collection/field mới, không sửa collection `rooms`/`players`/`users` hiện có** (trừ đọc `users.is_host`). Sao lưu `pb_data` trước khi deploy migration.
- Người dùng không đăng nhập: mỗi máy 1 tài khoản ẩn danh (`lib/pb.ts` `ensureAuth`). Quyền BTC = `users.is_host` (đã có, cấp qua QR đỏ).
- Trên iPhone, app ở màn hình chính có bộ nhớ riêng với Safari → người chơi phải quét QR giải bằng nút **Quét mã QR** trong app (đã có `app/QrScanner.tsx`).
- Sóng ở sân yếu: mọi thao tác ghi của BTC phải chịu được mất mạng vài giây (thử lại, không mất tỉ số đã nhập).
- Dữ liệu cá nhân: số điện thoại chỉ BTC của giải đó đọc được.
- Không xóa hàng loạt user/bản ghi trên server thật; test chỉ dùng tài khoản `test-...`.

## 4. Các cách đã cân nhắc

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| 1. Thêm màn hình giải vào `app/page.tsx` | Nhanh lúc đầu; file 2.000+ dòng phình lên 4.000–5.000, dễ làm hỏng chế độ vãng lai | Loại |
| **2. Trang riêng `/giai` trong cùng app** | Tốn ~1 buổi dựng khung; logic giải tách riêng, test được, gần như không chạm chế độ vãng lai; dùng chung auth/QR/chuông/server | **Đã chọn** |
| 3. Phần mềm giải có sẵn (Challonge, Tournament Software…) | Không phải lập trình; nhưng không tiếng Việt, không báo "tới lượt", không chung QR/quyền, có phần thu phí | Loại (đi ngược lý do tích hợp) |

Đợt chỉnh sửa ngày 20/10 (tách `page.tsx` thành component, bảo mật players…) chưa được kiểm tra nên **không** dùng làm nền; nó được cất ở nhánh `refactor-20-10` và sẽ xử lý riêng sau.

## 5. Các quyết định đã chốt với chủ sân

1. Mỗi nội dung **4–12 đôi**.
2. Thể thức: **cả vòng tròn và vòng bảng → loại trực tiếp** (BTC chọn cho từng nội dung).
3. Luật điểm: **tùy chọn** số set và điểm mỗi set.
4. **Chỉ BTC nhập tỉ số** (máy có quyền chủ sân).
5. Một giải có **nhiều nội dung** chạy song song, dùng chung sân.
6. **Một người có thể đăng ký nhiều nội dung** (mỗi nội dung một đồng đội).
7. Đăng ký **qua link trước giải**.
8. Chia bảng: **hạt giống + bốc thăm, BTC chỉnh tay trước khi công bố** (chủ sân giao cho đề xuất của Claude).
9. Mỗi giải có **mã BTC riêng**: máy có quyền chủ sân nhập mã là cùng điều khiển giải (khôi phục khi mất máy, 2 người cùng làm BTC).

## 6. Thiết kế chi tiết

### 6.1 Luật thi đấu (căn cứ nghiên cứu ngày 29/10)

**Luật điểm** — cấu hình theo từng nội dung: `games` = 1 hoặc 3 (thắng 2 set), `points` = 15 / 21 / số tự nhập (vd. 31), `cap` = trần điểm.
- Mặc định gợi ý: `points` 21 → `cap` 30; `points` 15 → `cap` 21 (luật 3×15 BWF áp dụng từ 04/01/2027: hòa 14–14 phải hơn 2 điểm, trần 21). Số tự nhập → `cap` = points + 9, BTC sửa được.
- Một set hợp lệ khi: bên thắng đạt ≥ `points` và hơn ≥ 2 điểm, **hoặc** bên thắng đạt đúng `cap` và hơn 1 điểm. App kiểm tra khi BTC nhập; tỉ số không hợp lệ thì cảnh báo nhưng cho phép lưu nếu BTC xác nhận (giải phong trào đôi khi dừng sớm).

**Thể thức gợi ý theo số đôi đã duyệt** (BTC đổi được trước khi bốc thăm):

| Số đôi | Gợi ý mặc định |
|---|---|
| 4–5 | Vòng tròn |
| 6–8 | 2 bảng, mỗi bảng lấy 2 → bán kết chéo → chung kết |
| 9–12 | 2 bảng lấy 2 → bán kết chéo (mặc định); hoặc 4 bảng lấy 2 → tứ kết |

Chỉ hỗ trợ số bảng = 2 hoặc 4 và lấy 1–2 đội mỗi bảng (để nhánh luôn là 2/4/8 đội, không cần so "đội nhì tốt nhất" giữa các bảng).

**Xếp hạng vòng bảng / vòng tròn — BWF General Competition Regulations 5.1, điều 16.2:**
1. Số trận thắng.
2. Hai đôi bằng nhau → đôi thắng trận đối đầu xếp trên.
3. Từ ba đôi bằng nhau → hiệu số set (thắng − thua) **trong toàn bảng**; nếu còn đúng hai đôi bằng → đối đầu; còn ≥ ba → hiệu số điểm; còn hai → đối đầu; còn ≥ ba → bốc thăm (app bốc ngẫu nhiên, lưu kết quả, hiện chú thích "bốc thăm").
4. Đôi bỏ cuộc / không hoàn thành vòng bảng: **mặc định** ghi trận còn lại là thắng xử ép (walkover, tính 2–0 set, 21–0 điểm mỗi set theo `points`) cho đối thủ; tùy chọn "luật BWF" thì xóa toàn bộ kết quả của đôi đó khỏi bảng. *(Quyết định của Claude: giải phong trào quen walkover.)*

**Loại trực tiếp:** bán kết chéo `A1–B2`, `B1–A2`; tứ kết `A1–B2`, `C1–D2`, `B1–A2`, `D1–C2` (nửa nhánh trên A1/C1, nửa dưới B1/D1 → hai đội cùng bảng chỉ gặp lại ở chung kết). Thua bán kết = **đồng hạng ba** (không đánh tranh hạng ba ở đợt 1).

### 6.2 Dữ liệu (PocketBase — collection mới)

Tất cả có `created`/`updated` autodate. Quan hệ tới `users` **không** `cascadeDelete` (bài học: xóa user từng làm mất phòng).

- **`tournaments`** — `code` (6 số, unique, mã/QR giải; id bản ghi suy từ code như `rooms`), `name`, `hosts` (relation users, **nhiều** — mọi máy BTC của giải), `status` (`draft` | `registration` | `closed` | `running` | `finished`), `reg_deadline` (date, tùy chọn), `courts` (json `[{id, name}]`), `settings` (json: `rest_minutes` mặc định 10, `walkover_mode`).
- **`events`** (nội dung) — `tournament`, `name`, `category` (`MD`|`WD`|`XD`|`open`, dùng để kiểm tra giới tính khi đăng ký), `max_entries` (≤ 12), `format` (`rr`|`groups_ko`), `groups` (2|4), `advance` (1|2), `scoring` (json `{games, points, cap}`), `stage` (`registration`|`drawn`|`groups`|`ko`|`done`), `order` (thứ tự hiện).
- **`participants`** (người) — `tournament`, `name`, `gender`, `skill` (cùng thang 10 bậc như app vãng lai), `user` (relation users, trống tới khi người đó "nhận" tên mình). Một người = một bản ghi trong giải, dùng cho mọi nội dung.
- **`contacts`** — `participant`, `phone`. Rule: chỉ BTC của giải đọc; người đăng ký tạo được.
- **`entries`** (đôi) — `event`, `p1`, `p2` (relation participants), `status` (`pending`|`approved`|`waitlist`|`withdrawn`), `seed` (số, trống = không hạt giống), `group` (`A`..`D`), `paid` (bool), `created_by` (users).
- **`matches`** — `event`, `stage` (`group`|`ko`), `group`, `round`, `order` (thứ tự trong vòng), `entry_a`, `entry_b` (có thể trống ở nhánh chờ đội thắng), `feeds` (json: trận này lấy đội thắng từ trận nào / hạng mấy bảng nào), `status` (`pending`|`ready`|`called`|`playing`|`done`|`walkover`), `court` (id sân), `scores` (json `[[a,b],…]`), `winner` (`a`|`b`), `called_at`, `finished_at`, `log` (json: lịch sử sửa tỉ số `{at, by, from, to}`).

- **`tournament_secrets`** — `tournament`, `btc_code` (chuỗi ngẫu nhiên ~8 ký tự dễ đọc, không nhầm 0/O, 1/l). Chỉ `hosts` của giải đọc được.

**Mã BTC (đã chốt với chủ sân — phương án a):** khi tạo giải, server sinh `btc_code`; máy tạo giải được thêm vào `hosts`. Trang quản lý giải hiện mã BTC (và QR chứa mã). Máy khác **có quyền chủ sân** (`is_host`) nhập/quét mã BTC → route `POST /api/badrally/tournament-join` thêm tài khoản đó vào `hosts`. Dùng để: khôi phục khi mất máy / xóa dữ liệu / iPhone tách Safari và app màn hình chính, và cho 2 người cùng làm BTC trong ngày thi đấu. BTC xem danh sách máy BTC và gỡ được; đổi mã BTC được. Mọi BTC có quyền ngang nhau; thao tác ghi đồng thời từ 2 máy đi qua realtime như bình thường (cùng trận thì bản ghi sau thắng, có `log`).

**Quyền:**
- Tạo giải: `@request.auth.is_host = true`. Sửa giải / nội dung / trận / duyệt đôi / xem `contacts`: chỉ tài khoản nằm trong `hosts` của giải.
- Người chơi (đã đăng nhập ẩn danh): xem mọi thứ của giải (trừ `contacts`); khi giải ở `registration` và trước `reg_deadline`: tạo `participants` + `entries` (status do server đặt), sửa/rút đôi mình tạo, nhận tên (`participants.user` từ trống → chính mình).
- Server hook (pb_hooks) kiểm tra: còn hạn đăng ký; vượt `max_entries` → `waitlist`; giới tính đúng nội dung; một người không ở 2 đôi trong cùng nội dung; người đăng ký không tự đặt `status/seed/group/paid`.

### 6.3 Luồng màn hình (trang `/giai`)

Lối vào: launcher hiện tại thêm nút **Giải đấu** (BTC: tạo/quản lý giải; mọi người: nhập mã/quét QR giải). QR giải trỏ `/giai?code=XXXXXX`; nút Quét mã QR nhận thêm dạng link này.

**BTC**
1. *Tạo giải*: tên, danh sách sân (tên), hạn đăng ký, thời gian nghỉ. Thêm nội dung: tên, loại (MD/WD/XD/open), số đôi tối đa, luật điểm. Mở đăng ký → hiện link + QR để gửi Zalo.
2. *Danh sách*: theo từng nội dung; duyệt / sửa tên / xóa / thêm tay đôi; tích "đã đóng lệ phí"; xem SĐT; danh sách chờ.
3. *Bốc thăm* (từng nội dung, sau khi khóa đăng ký): app gợi ý thể thức theo số đôi; đánh dấu hạt giống (gợi ý theo tổng trình độ); bốc → xem trước → bốc lại / đổi chỗ 2 đôi → **Công bố** (sinh trận vòng bảng / vòng tròn).
4. *Điều phối* (ngày thi đấu): lưới sân (trống / đang đánh trận gì), danh sách **trận sẵn sàng** do app gợi ý theo thứ tự, trận **bị khóa** kèm lý do ("Nam đang đánh Sân 5", "Lan nghỉ còn 4 phút"). Bấm **Gọi** để đưa trận vào sân trống (hoặc chọn sân/trận khác). Bấm vào trận đang đánh → **nhập tỉ số** → lưu. Có **Hoàn tác** ngay sau khi lưu và **Sửa tỉ số** sau đó (ghi `log`; chặn nếu trận nhánh sau đã bắt đầu).
5. Hết vòng bảng của một nội dung → app tính hạng, điền nhánh, sinh trận loại trực tiếp (BTC xác nhận; nếu có bốc thăm phá hòa thì hiện rõ).

**Người chơi / khán giả**
- Mở link/QR: tab các **nội dung** → mỗi nội dung có **Lịch**, **Bảng xếp hạng**, **Nhánh**.
- Đăng ký (khi mở): nhập tên mình (giới tính, trình độ, SĐT tùy chọn), chọn nội dung, nhập tên đồng đội; có thể thêm nội dung khác. Đồng đội mở link → **"Tôi là …"** chọn tên mình để nhận.
- Thẻ **Của tôi**: các đôi của tôi, trận kế tiếp (đối thủ, nội dung), trận đang được gọi. Khi trận của tôi chuyển `called` → chuông/rung/màn hình "TỚI LƯỢT BẠN – Sân 6 – Đôi nam vs …" (dùng lại `lib/alerts.ts`).

### 6.4 Gợi ý trận kế tiếp (hàng đợi chung)

Một trận **sẵn sàng** khi: đã có đủ 2 đôi, `status` = `pending`/`ready`, và **không ai trong 4 người** đang ở trận `called`/`playing` (bất kỳ nội dung nào) hoặc mới xong trận chưa đủ `rest_minutes`.

Thứ tự gợi ý: (1) vòng nhỏ hơn trước (trong vòng bảng/vòng tròn), vòng bảng trước loại trực tiếp; (2) nội dung còn nhiều trận chưa đánh hơn (để các nội dung xong gần cùng lúc); (3) người chờ lâu nhất (thời điểm xong trận gần nhất sớm nhất); (4) `order`.

Thứ tự trận vòng tròn sinh bằng phương pháp xoay vòng (circle method) để không đôi nào đánh 2 trận liền khi tránh được. BTC luôn có thể gọi tay một trận bị khóa (xác nhận "người này vừa đánh xong").

### 6.5 Chịu lỗi mạng & dữ liệu

- Ghi của BTC đi qua hàng đợi tuần tự (như `commit` hiện tại); lỗi mạng → giữ thao tác, thử lại, hiện "đang chờ đồng bộ".
- Tỉ số đã nhập được giữ trên máy (localStorage) tới khi server xác nhận.
- Mở lại app / có mạng lại → tải lại toàn bộ giải (như phòng vãng lai).
- Không có thao tác xóa giải ở đợt 1 ngoài trang quản trị; "Kết thúc giải" chỉ đổi `status`.

### 6.6 Cấu trúc mã (đề xuất)

- `app/giai/page.tsx` + `app/giai/*.tsx`: giao diện giải (component riêng, không sửa `app/page.tsx` ngoài nút lối vào và nhận link `/giai` trong máy quét).
- `lib/tournament/`: logic thuần, **có test** (`node --test`): luật điểm/kiểm tra set, xếp hạng BWF 16.2, sinh lịch vòng tròn, chia bảng + hạt giống, sinh nhánh, gợi ý trận.
- `pocketbase/pb_migrations/17917008xx_tournaments.js`, hook trong `pb_hooks/` (file riêng `tournament.pb.js`).
- Dùng lại: `lib/pb.ts`, `lib/alerts.ts`, `app/QrCode.tsx`, `app/QrScanner.tsx`, style neo-brutalist hiện tại.

### 6.7 Danh tính người chơi (tránh trùng người, nhiều máy, đổi đồng đội)

- **Không trùng người:** khi nhập tên mình hoặc tên đồng đội, ô nhập **gợi ý tên đã có trong giải** (tìm không dấu); chọn gợi ý thì dùng lại bản ghi `participants` cũ, gõ tên mới thì tạo mới. BTC có công cụ **Gộp 2 người** (chuyển mọi đôi của người B sang người A rồi xóa B) — cần sẵn trước giải thử, vì chặn trùng sân / thời gian nghỉ tính theo bản ghi người.
- **Nhiều máy cho một người:** `participants.user` là quan hệ **nhiều** (tối đa 3 tài khoản: Safari, app màn hình chính, máy khác). "Tôi là …" thêm tài khoản hiện tại vào danh sách. BTC xem và **gỡ** tài khoản đã nhận nhầm.
- **Đổi đồng đội / vắng mặt sau khi công bố:** BTC sửa `p1`/`p2` của một đôi bất cứ lúc nào trước khi trận cuối của đôi đó xong (lịch không sinh lại; kiểm tra trùng sân và nghỉ luôn đọc người hiện tại của đôi). Đôi vắng mặt → BTC bấm **Bỏ cuộc** → các trận còn lại xử theo `walkover_mode` (6.1). Không thêm đôi mới sau khi công bố ở đợt 1.

## 7. Để người xây dựng tự quyết

Bố cục và màu chi tiết của từng màn hình (theo phong cách app hiện tại); tên file/component; cách đóng gói route `/giai` với static export (kiểm tra `useSearchParams` + Suspense theo docs Next 16, và Caddy `try_files {path}.html` đã có); chi tiết rule PocketBase; thuật toán bốc thăm ngẫu nhiên (miễn số đôi mỗi bảng chênh ≤ 1, hạt giống tách bảng); cách hiển thị nhánh trên màn hình điện thoại; thứ tự công việc để kịp mốc thử giải.

## 8. Quyết định của Claude (chủ sân nên xem lại)

- Walkover mặc định cho đôi bỏ cuộc (thay vì xóa kết quả theo BWF), có tùy chọn luật BWF.
- Đồng hạng ba, không đánh tranh hạng ba.
- Chỉ 2 hoặc 4 bảng, lấy 1–2 đội mỗi bảng.
- Thời gian nghỉ mặc định 10 phút.
- Tỉ số sai luật vẫn lưu được nếu BTC xác nhận.
- Số điện thoại không bắt buộc, chỉ BTC thấy.
- Gợi ý tên có sẵn + công cụ Gộp 2 người để tránh trùng người (6.7).
- Một người gắn tối đa 3 tài khoản; BTC gỡ được tài khoản nhận nhầm (6.7).
- BTC đổi được đồng đội sau khi công bố; không thêm đôi mới sau khi công bố (6.7).

## Nguồn tham khảo

- BWF – Members approve 3×15 scoring system: https://bwfbadminton.com/news-single/2026/04/25/bwf-members-approve-3x15-scoring-system
- BWF – Key changes under the 3×15 scoring system: https://bwfbadminton.com/news-single/2026/04/26/key-changes-under-the-3x15-scoring-system
- BWF General Competition Regulations 5.1 (11/2024), điều 16.2: https://extranet.bwf.sport/docs/document-system/81/1466/1471/Section%205.1%20-%20General%20Competition%20Regulations%20-%209%20November%202024%20V6.0%20(1).pdf
- BadmintonNL – Tie breaking procedure: https://www.badmintonnl.ca/resources/tie-breaking-procedure/
- Điều lệ giải thể thao THADS Tuyên Quang 2024 (4–5 đôi vòng tròn, ≥ 6 đôi chia bảng)
