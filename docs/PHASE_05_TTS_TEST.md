# PHASE 5 — ZEROTTS

## 1. Cài đặt (đã xin phép người dùng trước khi cài phần mềm hệ thống)

- **Python 3.12.10** cài qua winget (`winget install --id Python.Python.3.12`, nguồn chính thức `python.org` qua winget, hash đã được winget xác minh) — **đã hỏi và được người dùng xác nhận chọn phương án này** trước khi cài.
- Tạo venv **chuẩn thư viện `venv` có sẵn trong Python** (không cài thêm `uv`, giảm số phần mềm cài vào máy): `python -m venv .venv` → tạo đúng cấu trúc Windows `.venv\Scripts\python.exe`.
- Cài gói theo đúng README gốc: `pip install zerotts pillow` — cài sạch 100%, toàn bộ là **wheel dựng sẵn cho Windows/Python 3.12 (`cp312-win_amd64`)**, không cần biên dịch native, không cần Visual Studio Build Tools. `zerotts` dùng **ONNX Runtime (CPU-only, không cần GPU/PyTorch)**.

## 2. ⚠️ Lỗi tương thích Windows thật phát hiện & đã sửa

Khi khởi động server sau khi cài Python, server vẫn không tìm thấy Python trong venv. Nguyên nhân: hàm `resolvePythonBin()` trong `server.js` (dòng ~121) chỉ kiểm tra đường dẫn venv kiểu POSIX:

```js
// TRƯỚC (lỗi trên Windows):
resolvePythonBin() {
  const venvPy = path.join(__dirname, '.venv', 'bin', 'python'); // chỉ đúng trên macOS/Linux
  if (fs.existsSync(venvPy)) return venvPy;
  return 'python3'; // lệnh này không tồn tại mặc định trên Windows
}
```

Trên Windows, venv đặt executable tại `.venv\Scripts\python.exe`, không phải `.venv/bin/python`; và lệnh `python3` không có sẵn (chỉ có `python`). Đã sửa tối thiểu để tương thích cả hai hệ điều hành:

```js
// SAU (đã sửa):
resolvePythonBin() {
  const venvCandidates = [
    path.join(__dirname, '.venv', 'bin', 'python'),
    path.join(__dirname, '.venv', 'Scripts', 'python.exe')
  ];
  for (const candidate of venvCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}
```

Đây đúng là loại lỗi "xử lý đường dẫn Windows" mà Phase 3 đã dự phòng nhưng chỉ phát hiện được khi có Python thật để test (trước đó không phát hiện vì chưa cài Python). Đã test lại: sau khi sửa, server tự tìm đúng `D:\Projects\ChuaLinhUng-NodeJS\.venv\Scripts\python.exe` và khởi chạy worker thành công — log xác nhận: `[ZeroTTS] Khởi chạy worker với D:\Projects\ChuaLinhUng-NodeJS\.venv\Scripts\python.exe`.

## 3. Kết quả kiểm thử

| Hạng mục | Kết quả |
|---|---|
| Tải model lần đầu (từ HuggingFace `zeroweight-ai/ZeroTTS`) | ✅ PASS — 38 file, ~24 giây tải (mạng tốt), tự động cache tại `C:\Users\<user>\.cache\huggingface\hub` (~1.0 GB) |
| Trạng thái worker | ✅ Hiển thị đúng chuỗi trạng thái `loading` → `ready`, xác nhận qua `GET /api/state` và dashboard Admin: **"ZeroTTS: ready (Giọng: maichi)"** |
| Số giọng đọc sẵn có | ✅ 8 giọng: `maichi, baotrang, giahuy, hamy, huuduc, kimoanh, quangminh, tiendat` |
| Tổng hợp câu tiếng Việt có dấu đầy đủ | ✅ PASS — `"Nam mô A Di Đà Phật. Cảm tạ thí chủ Nguyễn Thị Hương đã thành tâm thắp ba nén hương thơm."` → WAV hợp lệ (PCM 16-bit, mono, **48kHz** — đúng thiết kế) |
| Tổng hợp với nickname kiểu mạng xã hội (`Quỳnh_Finn`) | ✅ PASS — đọc đúng, không lỗi |
| Lọc ký tự lạ (Cuneiform `𒐫`, emoji, `[rose]`) | ✅ PASS — trả về `{"ok":false,"error":"Filtered empty/spam text"}`, không đọc rác |
| Cache âm thanh (gọi lại cùng 1 câu) | ✅ PASS — lần 2 trả về tức thì (`cached:true`, 68ms) thay vì tổng hợp lại |
| Nhiều giọng khác nhau (`baotrang`) | ✅ PASS |
| Tốc độ tổng hợp (CPU, không GPU) | Câu ngắn (~10-15 từ): **3.5–6 giây**; câu dài hơn (lần đầu, có warm-up): ~14 giây. Đây là xử lý nền (hàng đợi), không chặn UI — chấp nhận được cho use-case đọc lời khấn/cảm tạ không cần real-time tuyệt đối |
| Pipeline đầy đủ từ trình duyệt (bấm nút → synthesize → phát WAV) | ✅ PASS — đã test thật trên browser: bấm "Thắp 3 Nén Hương" → quan sát network request `POST /api/tts` (200) → `GET /tts-cache/....wav` (206 Partial Content, hỗ trợ audio streaming/seek đúng chuẩn) |
| Lỗi TTS không làm sập Node | ✅ Đã xác nhận ở Phase 3/4 (khi Python chưa cài, worker thoát mã 9009) — Node server tiếp tục chạy bình thường, các nghi thức khác vẫn hoạt động. Dashboard hiển thị đúng trạng thái `stopped` khi đó |
| Hoạt cảnh không phụ thuộc giọng đọc | ✅ Đã xác nhận ở Phase 4 — toàn bộ animation/merit vẫn chạy khi TTS stopped |

## 4. Tài nguyên hệ thống (ghi nhận cho tài liệu vận hành Phase 7)

- Dung lượng `.venv`: ~312MB
- Dung lượng cache model HuggingFace: ~1.0GB (tải 1 lần, dùng lại cho các lần chạy sau)
- RAM tiến trình Python worker khi đã nạp model: **~3.3GB** — đáng kể, cần ghi vào tài liệu vận hành để người dùng biết yêu cầu RAM tối thiểu của máy khi bật ZeroTTS.
- Windows không hỗ trợ symlink mặc định cho cache HuggingFace (cảnh báo `UserWarning` lúc tải, không phải lỗi) → cache lưu dạng file đầy đủ thay vì symlink, tốn thêm disk nhưng vẫn hoạt động đúng. Có thể tắt cảnh báo bằng biến môi trường `HF_HUB_DISABLE_SYMLINKS_WARNING=1` nếu muốn (không bắt buộc).

## 5. Hạn chế & ghi nhận cho Phase 7

- **ZeroTTSManager hiện không tự khởi động lại worker nếu nó bị crash/thoát** (xem `server.js`, sự kiện `this.proc.on('exit', ...)` chỉ dọn hàng đợi, không `startWorker()` lại). Điều này tránh được "restart vô hạn" nhưng cũng có nghĩa: nếu worker crash giữa buổi live, TTS sẽ **dừng vĩnh viễn cho tới khi restart cả server**, dù các nghi thức khác vẫn chạy bình thường. Đề xuất bổ sung ở Phase 7: cơ chế retry có giới hạn số lần (ví dụ tối đa 3 lần, giãn cách tăng dần) thay vì không retry.

## Kết luận Phase 5

**PASS** — Đã cài đặt Python 3.12 (có xin phép), tạo venv, cài `zerotts`+`pillow` thành công trên Windows không cần biên dịch native. Phát hiện và sửa 1 lỗi tương thích Windows thật (`resolvePythonBin`). ZeroTTS hoạt động đầy đủ: tải model, tổng hợp giọng Mai Chi và các giọng khác, lọc ký tự lạ, cache âm thanh, tích hợp hoàn chỉnh với pipeline sự kiện trên trình duyệt. Không ảnh hưởng chức năng gốc nào khác ngoài việc sửa đúng 1 bug path Windows.
