# PHASE 1 — AUDIT MÔI TRƯỜNG WINDOWS 11

Ngày kiểm tra: 2026-11-02
Máy: Windows 11 Home Single Language, build 10.0.26200.9711 (26200)

## Kết quả kiểm tra công cụ

| Công cụ | Lệnh kiểm tra | Kết quả | Đạt/Chưa đạt |
|---|---|---|---|
| Windows | `cmd /c ver` | 10.0.26200.9711 (Windows 11) | ✅ Đạt |
| PowerShell | `$PSVersionTable.PSVersion` | 5.1.26100.9711 (Windows PowerShell built-in, không có PowerShell 7/`pwsh`) | ✅ Đạt (đủ dùng cho script .cmd/.ps1 cơ bản) |
| VS Code | `code --version` | 1.141.0 | ✅ Đạt |
| Node.js | `node -v` | v24.19.0 | ✅ Đạt (bản mới, hỗ trợ ESM/CJS, `--watch`, native `fetch`, v.v.) |
| npm | `npm -v` | 11.17.0 | ✅ Đạt |
| Git | `git --version` | 2.55.0.windows.4 | ✅ Đạt |
| Python | `python --version` | **Chưa cài** — chỉ có App Execution Alias trỏ tới Microsoft Store (`python.exe` tại `WindowsApps`, chạy sẽ mở Store) | ❌ Chưa đạt — cần cho ZeroTTS worker (Phase 5) |
| py launcher | `py -0p` | Không có | ❌ Chưa đạt (đi kèm với cài Python chính thức) |
| uv | `uv --version` | Chưa cài | ❌ Chưa đạt — cần xác nhận lại ở Phase 5 sau khi đọc `tts_worker.py`/`requirements.txt` để biết source gốc có dùng `uv` hay chỉ `pip` thường |
| FFmpeg | `ffmpeg -version` | Chưa cài | ⚠️ Chưa rõ có cần hay không — sẽ xác nhận ở Phase 2 khi đọc code xử lý audio/TTS |
| winget | `winget --version` | v1.29.380 | ✅ Có sẵn, dùng làm nguồn cài đặt ưu tiên |
| Cổng 3000 | `netstat -ano \| grep ":3000"` | Không có tiến trình nào đang lắng nghe cổng 3000 | ✅ Cổng trống, sẵn sàng cho server |
| Dung lượng ổ D: | `df -h /d` | 1.8TB trống / 1.9TB | ✅ Đủ chỗ |

## Quyết định

- **Node.js, npm, Git, VS Code, PowerShell**: đã đủ điều kiện, KHÔNG cài lại.
- **Python / uv / FFmpeg**: chưa cài. Theo ràng buộc của nhiệm vụ, sẽ **không cài ngay** mà chờ đến khi đọc xong source gốc (Phase 2) để biết chính xác:
  - Phiên bản Python mà `tts_worker.py` yêu cầu (ví dụ 3.10/3.11/3.12).
  - Source gốc có dùng `uv` để quản lý venv/dependency Python không, hay chỉ cần `pip` + `venv` chuẩn.
  - FFmpeg có thực sự được gọi trong code xử lý audio/video không (overlay OBS dùng browser source nên nhiều khả năng không cần FFmpeg phía server).
  - Sau khi xác định, sẽ **xin phép người dùng** trước khi cài qua winget/nguồn chính thức (theo ràng buộc "không cài phần mềm toàn hệ thống... mà chưa xin phép").
- Vì Node/npm/Git đã sẵn sàng (đủ để clone + cài dependency + chạy `npm start`), đủ điều kiện để qua **Phase 2**. Python/uv/FFmpeg sẽ được xử lý trong Phase 2 (xác định yêu cầu) và Phase 5 (cài đặt thực tế cho ZeroTTS) nếu cần.

## Thay đổi đã thực hiện trong Phase này

- Không có thay đổi hệ thống nào được thực hiện (chỉ kiểm tra, không cài/sửa gì).
- Tạo file báo cáo này: `docs/PHASE_01_ENVIRONMENT.md`.
