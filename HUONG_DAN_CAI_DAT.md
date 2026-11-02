# HƯỚNG DẪN CÀI ĐẶT — Chùa Linh Ứng Online (Node.js)

Hướng dẫn này áp dụng cho **Windows 11**, đã được kiểm thử thực tế trong quá trình chuyển đổi dự án (xem [docs/PHASE_01_ENVIRONMENT.md](docs/PHASE_01_ENVIRONMENT.md)).

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản đã test | Bắt buộc? |
|---|---|---|
| Windows | 11 (build 26200) | — |
| Node.js | v24.19.0 (yêu cầu tối thiểu 18+) | ✅ Bắt buộc |
| npm | đi kèm Node.js | ✅ Bắt buộc |
| Git | 2.55.0 | Chỉ cần nếu muốn clone/cập nhật source |
| Python | 3.12.10 | Chỉ cần nếu muốn bật giọng đọc ZeroTTS (không bắt buộc để chạy server) |

## 2. Cài Node.js (nếu chưa có)

Khuyến nghị cài qua winget (nguồn chính thức, có kiểm tra checksum):

```bash
winget install OpenJS.NodeJS.LTS
```

Hoặc tải trực tiếp từ [nodejs.org](https://nodejs.org/) (chọn bản LTS). Sau khi cài, **mở Terminal/CMD mới** để nhận PATH mới (terminal cũ sẽ không tự nhận biết Node vừa cài).

Kiểm tra:
```bash
node -v
npm -v
```

## 3. Cài dependency Node.js

Tại thư mục gốc dự án:

```bash
npm install
```

Lệnh này cài 4 package: `express`, `ws`, `cors`, `tiktok-live-connector`. Không cần quyền Administrator, không cần biên dịch native (không có dependency nào yêu cầu Visual Studio Build Tools).

## 4. (Tùy chọn) Cài ZeroTTS — giọng đọc AI tiếng Việt

**Lưu ý**: Nếu bỏ qua bước này, server vẫn chạy đầy đủ mọi tính năng khác (giao diện, hoạt cảnh, TikTok LIVE, Mock Live...) — chỉ riêng giọng đọc sẽ ở trạng thái "stopped".

### 4.1. Cài Python 3.12

```bash
winget install --id Python.Python.3.12
```

> Đã kiểm thử với Python 3.12.10. Package `zerotts` yêu cầu tối thiểu Python 3.9+, các bản 3.10-3.13 đều có khả năng tương thích (chưa kiểm thử ngoài 3.12).

**Lưu ý quan trọng trên Windows**: sau khi cài Python, PATH hệ thống cần một phiên Terminal/CMD **hoàn toàn mới** để nhận diện lệnh `python`. Nếu `python --version` vẫn báo "không tìm thấy" ngay sau khi cài, hãy đóng hẳn cửa sổ Terminal và mở lại (đây là hành vi bình thường của Windows, không phải lỗi cài đặt).

### 4.2. Tạo môi trường ảo (venv) và cài package

Tại thư mục gốc dự án:

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install zerotts pillow
```

Toàn bộ package cài qua `pip` đều có sẵn bản dựng cho Windows (`win_amd64`), **không cần Visual Studio Build Tools**, không cần GPU (ZeroTTS chạy trên ONNX Runtime, CPU-only).

### 4.3. Model AI

Model `zeroweight-ai/ZeroTTS` (~1GB) sẽ **tự động tải về từ HuggingFace trong lần chạy server đầu tiên** (cần Internet). Lần chạy sau sẽ dùng lại cache tại `%USERPROFILE%\.cache\huggingface\hub`, không cần tải lại.

Yêu cầu tài nguyên khi ZeroTTS hoạt động: ~312MB cho `.venv`, ~1GB cache model, **~3.3GB RAM** khi worker đã nạp model vào bộ nhớ (xem [docs/PHASE_05_TTS_TEST.md](docs/PHASE_05_TTS_TEST.md)).

## 5. Chạy thử lần đầu

```bash
npm start
```

Hoặc double-click [`START_NODEJS.cmd`](START_NODEJS.cmd).

Kiểm tra:
- http://localhost:3000 — màn hình Chánh Điện phải hiện ra
- http://localhost:3000/admin — dashboard Admin, mục "ZeroTTS: ready" nếu đã cài ZeroTTS thành công (hoặc "stopped" nếu bỏ qua bước 4)
- http://localhost:3000/?obs=1 — màn hình sạch cho OBS

Dừng server bằng `Ctrl+C` trong cửa sổ Terminal — dữ liệu Bảng Vàng Công Đức sẽ tự động được lưu trước khi thoát.

## 6. Kiểm tra toàn diện

Chạy [`CHECK_SYSTEM.cmd`](CHECK_SYSTEM.cmd) bất cứ lúc nào để xem báo cáo nhanh về Node/npm/Git/Python/venv/cổng 3000.

## 7. Bước tiếp theo

Xem [HUONG_DAN_VAN_HANH.md](HUONG_DAN_VAN_HANH.md) để biết cách cấu hình OBS, kết nối TikTok LIVE, dùng Mock Live, và vận hành dài hạn.
