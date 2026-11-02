# TROUBLESHOOTING — Xử lý sự cố thường gặp

## Server không khởi động được

**"'node' is not recognized..."** → Node.js chưa cài hoặc Terminal chưa nhận PATH mới. Cài qua `winget install OpenJS.NodeJS.LTS`, rồi **đóng hẳn và mở lại Terminal/CMD mới**.

**"Error: listen EADDRINUSE: address already in use :::3000"** → Cổng 3000 đang bị tiến trình khác chiếm. Chạy `CHECK_SYSTEM.cmd` để xem PID đang chiếm cổng, hoặc đổi cổng:
```bash
set PORT=3001
npm start
```

**`npm install` báo lỗi** → Kiểm tra kết nối Internet. Nếu lỗi liên quan tới `bufferutil`/`utf-8-validate` (native addon tùy chọn của `ws`), **bỏ qua an toàn** — đây là optional dependency, server vẫn chạy bình thường không cần chúng.

## ZeroTTS ở trạng thái "stopped" / "error"

- **"stopped"** → Chưa cài Python/venv, hoặc venv bị xóa. Đây **không phải lỗi nghiêm trọng** — mọi tính năng khác vẫn hoạt động đầy đủ. Làm theo [HUONG_DAN_CAI_DAT.md](HUONG_DAN_CAI_DAT.md) mục 4 nếu muốn bật giọng đọc.
- **"error" sau 3 lần tự khởi động lại thất bại** → Vào `/admin` → mục "5. Vận Hành & Giám Sát" → bấm "Khởi Động Lại ZeroTTS Worker" để thử lại thủ công. Nếu vẫn lỗi, kiểm tra:
  - `.venv\Scripts\python.exe --version` chạy được không
  - `.venv\Scripts\python.exe -m pip show zerotts` có hiển thị thông tin package không (nếu không, cài lại: `.venv\Scripts\python.exe -m pip install zerotts pillow`)
  - Còn đủ dung lượng ổ đĩa không (cần ~1GB cho cache model lần đầu)
  - Internet có chặn truy cập `huggingface.co` không (lần đầu cần tải model)
- **Tốn nhiều RAM (~3.3GB)** → Đây là mức RAM bình thường của model ZeroTTS đã nạp, không phải rò rỉ bộ nhớ. Nếu máy ít RAM, cân nhắc không bật ZeroTTS.

## TikTok LIVE không kết nối được

**"Failed to retrieve Room ID from all sources"** → Nguyên nhân phổ biến nhất: **tài khoản đó hiện KHÔNG đang phát LIVE**. Kiểm tra lại bằng cách mở app TikTok, xác nhận phiên LIVE đang chạy thật tại đúng thời điểm kết nối.

**Kết nối được một lúc rồi tự ngắt** → Có thể do:
1. Buổi live đã kết thúc thật.
2. TikTok vừa thay đổi cơ chế nội bộ, thư viện `tiktok-live-connector` tạm thời không tương thích — kiểm tra có bản cập nhật mới của package không: `npm outdated tiktok-live-connector`, rồi `npm install tiktok-live-connector@latest` nếu cần (đây là rủi ro cố hữu của mọi thư viện dò API không chính thức của TikTok, xem [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md)).

**Muốn test mà không có tài khoản đang live** → Dùng **Mock Live** thay vì cố kết nối thật, xem [HUONG_DAN_VAN_HANH.md](HUONG_DAN_VAN_HANH.md) mục 5.

## Giao diện / OBS

**Không nghe nhạc nền** → File nhạc bản quyền `public/assets/bg_chant.m4a` **không có sẵn trong source gốc** (bị loại trừ vì lý do bản quyền âm nhạc — xem `.gitignore`). Nếu bạn sở hữu bản quyền nhạc nền phù hợp, tự thêm file `.m4a` vào đúng đường dẫn đó. Không có file này, hệ thống tự chuyển sang nhạc nền tổng hợp (Web Audio), không lỗi, không vỡ giao diện.

**OBS Browser Source hiện trắng/trống** → Kiểm tra server có đang chạy không (mở `http://localhost:3000/?obs=1` bằng trình duyệt thường trước để xác nhận). OBS Browser Source cần server đã khởi động trước khi thêm nguồn.

**Màn hình OBS bị lộ nút điều khiển** → Đảm bảo URL có đúng `?obs=1` ở cuối, không phải chỉ `http://localhost:3000`.

## WebSocket / mất kết nối

Client tự động phục hồi kết nối (xem [CHANGELOG_MIGRATION.md](CHANGELOG_MIGRATION.md)) — nếu mất mạng tạm thời, màn hình sẽ tự nối lại trong vài giây, không cần tải lại trang (F5). Nếu sau nhiều phút vẫn không tự nối lại, kiểm tra server có còn đang chạy không, và thử tải lại trang thủ công.

## Dữ liệu Bảng Vàng Công Đức bị mất sau khi khởi động lại

- Dùng `Ctrl+C` để dừng server (không dùng nút X đóng cửa sổ hay Task Manager) — xem [HUONG_DAN_VAN_HANH.md](HUONG_DAN_VAN_HANH.md) mục 1.
- Kiểm tra file `data/merit-state.json` có tồn tại và không rỗng sau khi dừng server.
- Nếu muốn đặt lại hoàn toàn (xóa sạch bảng vàng), gọi RPC `temple.resetMerit` qua dashboard Admin hoặc xóa thủ công file `data/merit-state.json` (sẽ tự tạo lại mặc định khi chạy server lần tiếp theo).

## Chữ tiếng Việt hiển thị lỗi (dấu hỏi `?`, ký tự lạ) khi test qua dòng lệnh

Đây **không phải lỗi server** — là vấn đề tương thích ký tự dòng lệnh khi gọi `curl.exe` có tham số tiếng Việt từ Git Bash/MSYS trên Windows (đã xác minh trong [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md) mục 4). Dữ liệu tiếng Việt gõ trực tiếp trên trình duyệt hoặc gửi qua file JSON UTF-8 luôn hiển thị đúng.

## Dashboard Admin báo "Cần token quản trị"

Bạn đã đặt biến môi trường `ADMIN_TOKEN` khi chạy server. Truy cập lại bằng `http://localhost:3000/admin?token=<token-ban-da-dat>`. Nếu quên token, dừng server, chạy lại không đặt `ADMIN_TOKEN` (hoặc đặt token mới).
