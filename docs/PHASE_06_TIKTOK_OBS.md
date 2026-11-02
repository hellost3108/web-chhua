# PHASE 6 — TIKTOK LIVE & OBS

## 1. Cách source tích hợp TikTok LIVE (đọc code, không giả định)

- **Thư viện**: [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector), khai báo `^2.1.0` trong `package.json`, `npm install` thực tế lấy về **2.5.0** (bản mới nhất tương thích semver).
- **Phương thức kết nối**: `new TikTokLiveConnection(username, {...}).connect()` — client kết nối tới hạ tầng WebSocket công khai của TikTok mà **chỉ cần `@username` của phòng đang live**, không cần đăng nhập, không cần cookie, không cần token tài khoản nào. Đã xác nhận qua code (`server.js` hàm `connectTikTokLive`): tham số duy nhất truyền vào là username, không có trường password/cookie/session ở bất kỳ đâu trong source.
- **Điều kiện để kết nối thành công**: tài khoản TikTok đó phải **đang phát LIVE thật** tại thời điểm gọi `connect()`. Nếu không đang live, thư viện trả lỗi (ví dụ đã gặp thực tế: `"Failed to retrieve Room ID from all sources"`), được `catch` và lưu vào `state.tiktok.lastError`, không làm sập server.
- **Tình trạng duy trì thư viện** (tra cứu bên ngoài, ghi rõ nguồn): dự án vẫn được duy trì tích cực — bản `2.4.0` phát hành giữa 2026, repo có ~2.000 sao GitHub, ~15.000 lượt tải/tuần theo Snyk. Tuy nhiên **rủi ro là có thật**: TikTok thay đổi cơ chế ký (signing)/giao thức protobuf nội bộ theo chu kỳ, các bản cũ hơn `v1.1.7` từng ngừng hoạt động hoàn toàn sau 1 lần TikTok đổi API — nghĩa là thư viện **có thể ngừng hoạt động bất cứ lúc nào TikTok đổi cơ chế nội bộ**, cho tới khi maintainer vá lại. Đây là rủi ro cố hữu của mọi thư viện dò API không chính thức của TikTok, không phải lỗi của source gốc hay của việc migrate Node.js.
- **Quyền cần thiết phía người dùng cuối**: chỉ cần tài khoản TikTok **của chính người dùng** đang bật LIVE công khai (không cần quyền admin, không cần API key TikTok chính thức — TikTok không phát hành API LIVE chính thức công khai cho việc này).

→ **Kết luận**: cách tích hợp hiện tại tuân thủ đúng ràng buộc "không cookie đánh cắp / không token không sở hữu / không vượt kiểm soát truy cập" — vì nó vốn chỉ dùng @username công khai, không có cơ chế xác thực nào trong source để có thể lạm dụng.

## 2. Chế độ MOCK LIVE (tính năng mới xây dựng trong Phase này)

Theo yêu cầu "tạo chế độ MOCK LIVE dùng chung pipeline xử lý event với LIVE thật", đã refactor `server.js`:

- **Trước**: 5 handler sự kiện TikTok (`MEMBER`, `CHAT`, `LIKE`, `FOLLOW`/`SHARE`, `GIFT`) được định nghĩa dưới dạng closure **nằm bên trong** `connectTikTokLive()`, chỉ chạy được khi có kết nối TikTok thật.
- **Sau**: tách thành 5 hàm độc lập ở top-level (`handleMemberEvent`, `handleChatEvent`, `handleLikeEvent`, `handleSocialEvent`, `handleGiftEvent`) — `connectTikTokLive()` chỉ còn `tiktokConn.on(WebcastEvent.X, handleXEvent)`, logic xử lý bên trong **giữ nguyên 100% không đổi 1 dòng**.
- Thêm `mockLiveEvent(type, params)` — dựng 1 object dữ liệu giả lập đúng hình dạng mà `tiktok-live-connector` phát ra, rồi gọi **thẳng cùng 1 hàm xử lý** ở trên (`handleChatEvent`, `handleGiftEvent`,...). Không có đường mạng nào được mở, không có gói tin nào gửi đi.
- Người dùng giả lập có `uniqueId` tiền tố **`mock_`** cố định và tên hiển thị tiền tố **`MOCK_`** — **không bao giờ lẫn với dữ liệu người xem thật** khi xem log/bảng vàng/file `merit-state.json`.
- 2 RPC method mới: `live.mockEvent` (bắn 1 sự kiện mock thủ công, dùng để test) và `live.setMockMode` (bật/tắt vòng lặp tự sinh sự kiện mock mỗi 4 giây — tương tự tinh thần `autoSim` có sẵn nhưng đi qua đúng pipeline sự kiện TikTok thay vì gọi thẳng `Rituals.*`).

File thay đổi: [server.js](../server.js).

## 3. Kết quả test từng loại sự kiện (qua `live.mockEvent`, tức **đúng pipeline** dùng cho LIVE thật)

| Sự kiện | Lệnh test | Kết quả |
|---|---|---|
| `member` (vào phòng) | `live.mockEvent {type:"member"}` | ✅ PASS — ghi nhận "Đã vào Chánh Điện lễ Phật", +1 CĐ |
| `chat` (bình luận) | `live.mockEvent {type:"chat", comment:"con xin thắp hương..."}` | ✅ PASS — đi qua `parseViewerComment`, nhận diện đúng từ khóa, kích hoạt `burnIncense`, tiếng Việt có dấu giữ nguyên vẹn (xác nhận qua `/api/state`, xem mục 4) |
| `like` (thả tim) | `live.mockEvent {type:"like", count:5}` | ✅ PASS — gõ mõ +5 |
| `follow` | `live.mockEvent {type:"follow"}` | ✅ PASS — thỉnh chuông |
| `gift` đơn | `live.mockEvent {type:"gift"}` | ✅ PASS |
| **`gift` combo** (TikTok gửi nhiều sự kiện cho 1 lượt tặng, `repeatCount` tăng dần) | 3 bước `repeatCount=1→4→10` cùng `groupId`, rồi gửi lại `repeatCount=10,repeatEnd=true` lần 2 | ✅ **PASS — đúng yêu cầu "không kích hoạt trùng/lặp giá trị"**: chỉ sinh ra **3 sự kiện công đức** (ứng với delta 1, 3, 6 = tổng 10), lệnh lặp lại lần 4 (cùng `repeatCount=10,repeatEnd=true`) **bị bỏ qua hoàn toàn**, không cộng thêm công đức, không sinh event mới (đã kiểm tra `recentEvents.length` không đổi) |
| `disconnect` | `live.disconnect` | ✅ PASS — trả về đúng trạng thái `connected:false` |
| Mock Live tự động (`live.setMockMode:true`) | Bật, chờ 9s, tắt | ✅ PASS — tự sinh sự kiện mỗi ~4s khi bật (3→5 events trong 9s), **dừng hẳn ngay khi tắt** (không còn event mới sau 6s tiếp theo quan sát) |
| `join` | Trùng với `member` ở trên | ✅ PASS |

## 4. Xác minh xử lý UTF-8 tiếng Việt (làm rõ 1 hiểu lầm trong lúc test)

Lần test đầu tiên gọi `curl -d '{"comment":"...tiếng Việt..."}'` trực tiếp từ Git Bash trên Windows cho kết quả bị lỗi font (`th?p huong`...). **Đã xác minh đây KHÔNG phải lỗi server**: đây là lỗi riêng của việc truyền tham số có dấu tiếng Việt qua `curl.exe` (chương trình Windows gốc) được gọi từ môi trường MSYS/Git-Bash — một vấn đề tương thích ký tự dòng lệnh đã biết, không liên quan gì đến Node.js hay code của dự án. Đã kiểm chứng lại bằng cách gửi cùng nội dung qua file JSON UTF-8 (`curl --data-binary @file.json`): server xử lý và lưu trữ **hoàn toàn chính xác** (`"con xin thắp hương cầu bình an cho gia đình"` nguyên vẹn trong `state.recentEvents`), khớp với kết quả đã thấy trên trình duyệt ở Phase 4. Không có thay đổi code nào cần thiết cho việc này.

## 5. Cấu hình OBS Browser Source / TikTok LIVE Studio

Đã xác nhận bằng code (`live.css`) và kiểm thử trực quan ở Phase 4 (`?obs=1` tại viewport mô phỏng 9:16):

| Yêu cầu | Trạng thái |
|---|---|
| Khung `1080 × 1920` | ✅ `#stage9x16` có `width:1080px; height:1920px` cố định trong CSS — khớp chính xác |
| Tỉ lệ 9:16 | ✅ |
| FPS 30 | ✅ Canvas particle engine khóa cứng 30 FPS trong `particles.js` (đã xác nhận ở Phase 2 đọc code), tự tạm dừng khi tab ẩn |
| Không scrollbar | ✅ Xác nhận bằng ảnh chụp thực tế ở chế độ `?obs=1` (Phase 4) |
| Không lộ nút quản trị | ✅ `quickDock` tự ẩn khi `?obs=1` (xác nhận Phase 4) |

**Hướng dẫn cấu hình OBS Studio (để đưa vào tài liệu vận hành Phase 7):**
1. Thêm nguồn mới → **Browser** (Trình duyệt).
2. URL: `http://localhost:3000/?obs=1`
3. Width: `1080`, Height: `1920`
4. FPS: `30` (khớp giới hạn vẽ phía client)
5. Tick **"Shutdown source when not visible"**: **KHÔNG** nên bật nếu muốn WebSocket giữ kết nối liên tục ngầm; để mặc định tắt tick này để tránh việc nguồn bị ngắt kết nối RPC mỗi khi chuyển cảnh.
6. Tick **"Control audio via OBS"** để nhạc nền/giọng đọc TTS được OBS mixer quản lý âm lượng.
7. Đặt nguồn Browser này full khung dọc 1080×1920 trong Scene nếu stream dọc, hoặc thu nhỏ căn giữa nếu stream ngang.

**Hướng dẫn kết nối TikTok LIVE Studio song song**: Màn hình `http://localhost:3000` (không có `?obs=1`) dùng để người vận hành theo dõi + bấm nút RPC thủ công trên máy stream, trong khi TikTok LIVE Studio/OBS lấy nguồn từ cổng `?obs=1` riêng — hai URL độc lập, không xung đột.

## 6. TikTok LIVE thật

**NOT TESTED** — theo đúng ràng buộc tuyệt đối của nhiệm vụ ("Không tự ý khởi động livestream TikTok thật... chỉ dùng MOCK LIVE trừ khi người dùng cung cấp tài khoản và xác nhận rõ ràng"), **không có bước nào trong Phase 6 kết nối tới phòng LIVE thật nào**. Server luôn chạy với `TIKTOK_USER` giả để bảo đảm an toàn tuyệt đối trong lúc test.

Nếu người dùng muốn kiểm thử LIVE thật, cần: (1) cung cấp `@username` TikTok của chính người dùng, (2) xác nhận tài khoản đó đang bật LIVE công khai tại thời điểm test, (3) xác nhận rõ ràng bằng lời trong hội thoại. Khi đó chỉ cần gọi RPC `live.connect {"username":"@..."}` hoặc nhập vào ô "Kết Nối Phòng TikTok Live" trên giao diện — không cần sửa code gì thêm.

## Kết luận Phase 6

**PASS (phần trong khả năng kiểm thử)** — Đã đọc và ghi nhận đầy đủ cách tích hợp + rủi ro của `tiktok-live-connector`. Đã xây dựng và kiểm thử kỹ chế độ MOCK LIVE dùng chung pipeline với LIVE thật, bao gồm cả trường hợp khó nhất (combo gift chống trùng). Cấu hình OBS đã xác minh đúng thông số. TikTok LIVE thật: **NOT TESTED** (đúng kế hoạch, cần tài khoản & xác nhận từ người dùng, không phải thiếu sót).
