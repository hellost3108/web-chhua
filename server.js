const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
// DATA_DIR/LOG_DIR có thể ghi đè qua biến môi trường — CHỈ dùng để cô lập dữ liệu khi
// chạy automated test (xem test/), tránh đụng vào data/merit-state.json hoặc logs/ thật
// của người dùng. Khi không đặt biến, hành vi giữ nguyên như trước (dùng thư mục dự án).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');
const LOG_DIR = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.join(__dirname, 'logs');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// ============================================================================
// 0. LOGGING & NHẬT KÝ LỖI (hiển thị trên dashboard + ghi file logs/server-*.log)
// ============================================================================
const BOOT_TIME = Date.now();
const errorLog = [];

function logLine(level, scope, message) {
  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
  if (level === 'ERROR' || level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
  try {
    const logFile = path.join(LOG_DIR, `server-${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFile(logFile, line + '\n', () => {});
  } catch (_) {}
  if (level === 'ERROR' || level === 'WARN') {
    errorLog.unshift({ id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString(), level, scope, message });
    if (errorLog.length > 50) errorLog.length = 50;
  }
}

// ============================================================================
// 1. BỘ 18 QUẺ LINH XĂM CHÙA LINH ỨNG (FORTUNE STICKS DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'Thượng Thượng Cát',
    title: 'Nhật Xuất Đông Phương — Mặt Trời Mọc Phương Đông',
    poem: 'Đông phương nhật xuất chiếu Càn Khôn\nHoa nở đầy cành rạng sắc xuân\nCông danh tài lộc đều viên mãn\nGia đạo bình an phúc lộc tồn.',
    meaning: 'Mọi sự mưu cầu đều đại cát đại lợi. Công việc hanh thông, quý nhân phù trợ, gia đình hòa thuận ấm êm.',
    ttsSummary: 'Quẻ số 1, Thượng Thượng Cát, Nhật Xuất Đông Phương. Mọi sự mưu cầu đều đại cát đại lợi, công danh tài lộc viên mãn, quý nhân phù trợ.'
  },
  {
    number: 8,
    rank: 'Thượng Cát',
    title: 'Kim Liên Khai Nở — Sen Vàng Tỏa Ngát',
    poem: 'Sen vàng nở rộ giữa hồ trong\nHương thơm lan tỏa khắp non sông\nLòng thành thắp nén nhang cầu nguyện\nTrời Phật chứng tri thỏa ước mong.',
    meaning: 'Tâm thiện lành ắt gặp phước báu. Cầu tài đắc tài, cầu bình an đắc bình an, bệnh tật tiêu trừ.',
    ttsSummary: 'Quẻ số 8, Thượng Cát, Kim Liên Khai Nở. Tâm thiện lành ắt gặp phước báu, cầu tài đắc tài, cầu bình an đắc bình an.'
  },
  {
    number: 12,
    rank: 'Đại Cát',
    title: 'Long Vân Tương Hội — Rồng Mây Gặp Gỡ',
    poem: 'Rồng thiêng gặp hội tầng mây xanh\nVượt Vũ Môn Quan rạng rỡ danh\nThí chủ kiên tâm hành thiện đạo\nPhúc dày lộc vượng khắp gia đình.',
    meaning: 'Thời vận đang lên mạnh mẽ. Thi cử đỗ đạt, kinh doanh phát đạt, gặp cơ hội lớn đổi đời.',
    ttsSummary: 'Quẻ số 12, Đại Cát, Long Vân Tương Hội. Thời vận đang lên mạnh mẽ, thi cử đỗ đạt, kinh doanh phát đạt.'
  },
  {
    number: 18,
    rank: 'Thượng Cát',
    title: 'Xuân Phong Đắc Ý — Gió Xuân Thuận Buồm',
    poem: 'Thuận buồm xuôi gió vượt trùng khơi\nBến giác bình yên nắng rạng ngời\nTài lộc dồi dào nhân duyên tốt\nBốn mùa hưng thịnh rộn niềm vui.',
    meaning: 'Đi xa gặp may, buôn bán thuận lợi, tình duyên êm đẹp, người thân mạnh khỏe.',
    ttsSummary: 'Quẻ số 18, Thượng Cát, Xuân Phong Đắc Ý. Thuận buồm xuôi gió, tài lộc dồi dào, nhân duyên tốt đẹp.'
  },
  {
    number: 24,
    rank: 'Trung Cát',
    title: 'Vũ Quá Thiên Thanh — Mưa Tạnh Trời Trong',
    poem: 'Mưa qua trời lại sáng trong ngần\nGian khó lùi xa đón phúc phần\nGiữ vững lòng thành đừng nản chí\nHoa thơm trái ngọt đến mười phân.',
    meaning: 'Khó khăn cũ sắp qua đi, vận may mới đang tới. Hãy kiên nhẫn và giữ tâm bình tĩnh.',
    ttsSummary: 'Quẻ số 24, Trung Cát, Vũ Quá Thiên Thanh. Mưa qua trời lại sáng trong, gian khó lùi xa để đón phúc phần mới.'
  },
  {
    number: 36,
    rank: 'Thượng Thượng Cát',
    title: 'Phúc Tinh Cao Chiếu — Sao Phúc Chiếu Mệnh',
    poem: 'Phúc tinh rực sáng giữa đêm rằm\nTừ bi Phật độ suốt quanh năm\nTài lộc tự nhiên về gõ cửa\nTrăm điều như ý vạn điều lành.',
    meaning: 'Sao Phúc chiếu mạng, tai qua nạn khỏi, tiền tài sung túc, gia đạo hưng long.',
    ttsSummary: 'Quẻ số 36, Thượng Thượng Cát, Phúc Tinh Cao Chiếu. Sao Phúc chiếu mạng, tài lộc tự nhiên gõ cửa, trăm điều như ý.'
  },
  {
    number: 52,
    rank: 'Thượng Cát',
    title: 'Ngọc Xuất Côn Sơn — Ngọc Quý Phát Sáng',
    poem: 'Ngọc quý Côn Sơn tỏa ánh ngời\nBấy lâu rèn giũa nay gặp thời\nTri âm tương ngộ cùng nâng đỡ\nSự nghiệp thăng hoa rạng rỡ đời.',
    meaning: 'Nỗ lực bấy lâu nay sắp được đền đáp xứng đáng. Có người tốt nâng đỡ trong công việc và cuộc sống.',
    ttsSummary: 'Quẻ số 52, Thượng Cát, Ngọc Xuất Côn Sơn. Nỗ lực bấy lâu sắp được đền đáp xứng đáng, sự nghiệp thăng hoa.'
  },
  {
    number: 68,
    rank: 'Đại Cát',
    title: 'Lộc Mã Đồng Hương — Lộc Tài Cùng Tới',
    poem: 'Lộc Mã song hành đến tận nhà\nLàm ăn buôn bán nở như hoa\nTâm thành bố thí thêm công đức\nPhú quý vinh hoa khắp một nhà.',
    meaning: 'Quẻ đại lợi về tài lộc và kinh doanh. Nên làm nhiều việc thiện để phúc đức càng thêm bền vững.',
    ttsSummary: 'Quẻ số 68, Đại Cát, Lộc Mã Đồng Hương. Đại lợi về tài lộc và buôn bán, phú quý vinh hoa khắp một nhà.'
  },
  {
    number: 81,
    rank: 'Thượng Cát',
    title: 'Nguyệt Nhập Trung Thiên — Trăng Rằm Giữa Đỉnh',
    poem: 'Trăng tròn vằng vặc giữa trời thu\nSoi sáng muôn phương sạch mây mù\nTình duyên viên mãn gia đình thuận\nTâm an vạn sự chẳng ưu tư.',
    meaning: 'Tình duyên và gia đạo vô cùng tốt đẹp. Người độc thân dễ gặp ý trung nhân, gia đình thêm tin vui.',
    ttsSummary: 'Quẻ số 81, Thượng Cát, Nguyệt Nhập Trung Thiên. Tình duyên viên mãn, gia đình hòa thuận, tâm an vạn sự lành.'
  },
  {
    number: 99,
    rank: 'Thượng Thượng Cát',
    title: 'Vạn Sự Viên Thành — Cửu Cửu Đại Cát',
    poem: 'Chín tầng mây trắng ánh hào quang\nTừ bi Phật Tổ độ nhân gian\nThí chủ lòng thành dâng lễ bái\nTrọn đời trường thọ hưởng vinh khang.',
    meaning: 'Quẻ tối thượng cát tường. Sức khỏe trường thọ, công danh hiển đạt, vạn sự viên thành.',
    ttsSummary: 'Quẻ số 99, Thượng Thượng Cát, Vạn Sự Viên Thành. Quẻ tối thượng cát tường, sức khỏe trường thọ, vạn sự như ý.'
  }
];

// ============================================================================
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI)
// ============================================================================
const TTS_MAX_AUTO_RESTARTS = 3;

class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.restartAttempts = 0;
    this.shuttingDown = false;
    this.manualRestartRequested = false;
    this.downHandled = false;
    this.restartTimer = null;
    // Cờ môi trường chỉ dùng cho automated test (xem docs/PHASE_0X_*): bỏ qua việc
    // khởi chạy worker Python (model ZeroTTS nặng ~GB RAM) khi chỉ cần test các luồng
    // khác (gift combo, AutoSim, RPC dispatcher...). KHÔNG đặt biến này khi vận hành thật.
    if (process.env.ZEROTTS_DISABLE === '1') {
      this.status = 'disabled';
      return;
    }
    this.startWorker();
  }

  /** Khởi động lại thủ công (nút "Khởi động lại ZeroTTS" trên dashboard) — luôn reset bộ đếm, không bị chặn bởi giới hạn auto-restart, và không bị trùng với 1 lần auto-restart đang chờ sẵn. */
  manualRestart() {
    if (process.env.ZEROTTS_DISABLE === '1') return this.getStatus();
    this.restartAttempts = 0;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.proc) {
      this.manualRestartRequested = true;
      try { this.proc.kill(); } catch (_) {}
    } else {
      this.manualRestartRequested = false;
      this.startWorker();
    }
    return this.getStatus();
  }

  resolvePythonBin() {
    // Cho phép ghi đè đường dẫn Python qua biến môi trường — dùng để test khả năng
    // chịu lỗi khi Python không tồn tại / sai đường dẫn (xem test Phase 3), và cũng
    // hữu ích khi vận hành thật muốn chỉ định rõ python binary thay vì tự dò.
    if (process.env.ZEROTTS_PYTHON_BIN) return process.env.ZEROTTS_PYTHON_BIN;
    const venvCandidates = [
      path.join(__dirname, '.venv', 'bin', 'python'),
      path.join(__dirname, '.venv', 'Scripts', 'python.exe')
    ];
    for (const candidate of venvCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    logLine('INFO', 'ZeroTTS', `Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    this.buffer = '';
    this.downHandled = false;

    let proc;
    try {
      proc = spawn(pyBin, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      // spawn() đồng bộ hiếm khi throw trực tiếp (lỗi khởi động thường báo qua event
      // 'error' bên dưới), nhưng vẫn bắt phòng hờ để không bao giờ làm crash Node.js.
      this.proc = null;
      this._handleWorkerDown(`Không thể khởi chạy Python worker: ${err.message}`);
      return;
    }
    this.proc = proc;

    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
    });

    // QUAN TRỌNG: bắt sự kiện 'error' của child process — nếu không có listener nào,
    // Node.js coi đây là uncaughtException và crash toàn bộ server (ví dụ không tìm
    // thấy Python trong PATH -> ENOENT, hoặc không có quyền thực thi -> EACCES).
    proc.on('error', (err) => {
      this._handleWorkerDown(`Lỗi khởi động Python worker (${err.code || 'error'}): ${err.message}`);
    });

    proc.on('exit', (code, signal) => {
      this._handleWorkerDown(`Worker thoát (mã ${code}${signal ? `, signal ${signal}` : ''})`);
    });
  }

  /**
   * Điểm xử lý DUY NHẤT khi worker không còn hoạt động, bất kể lý do là event 'error'
   * (spawn thất bại) hay 'exit' (worker đã chạy rồi crash/tự thoát) — tránh xử lý 2 lần
   * khi cả hai event cùng bắn ra cho một lần spawn thất bại, điều có thể gây lên lịch
   * retry trùng lặp hoặc chạy 2 worker Python đồng thời.
   */
  _handleWorkerDown(reason) {
    if (this.downHandled) return;
    this.downHandled = true;
    // Tiến trình (nếu có) đã chết/thất bại tại điểm này — bỏ tham chiếu để
    // manualRestart() / các lần kiểm tra sau biết là KHÔNG còn worker nào đang sống,
    // tránh gọi kill() vào một tiến trình đã chết (không làm gì, khiến restart "kẹt").
    this.proc = null;

    this.ready = false;
    for (const [, item] of this.pending) {
      clearTimeout(item.timer);
      item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
    }
    this.pending.clear();

    if (this.shuttingDown) {
      this.status = 'stopped';
      return;
    }

    if (this.manualRestartRequested) {
      this.manualRestartRequested = false;
      this.status = 'restarting';
      logLine('WARN', 'ZeroTTS', `${reason}. Khởi động lại thủ công theo yêu cầu từ dashboard Admin...`);
      broadcastNotification('tts.status', this.getStatus());
      this.startWorker();
      return;
    }

    if (this.restartAttempts < TTS_MAX_AUTO_RESTARTS) {
      this.restartAttempts += 1;
      const delayMs = this.restartAttempts * 5000;
      this.status = 'restarting';
      logLine('WARN', 'ZeroTTS', `${reason}. Tự khởi động lại lần ${this.restartAttempts}/${TTS_MAX_AUTO_RESTARTS} sau ${delayMs / 1000}s...`);
      broadcastNotification('tts.status', this.getStatus());
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.startWorker();
      }, delayMs);
    } else {
      this.status = 'error';
      logLine('ERROR', 'ZeroTTS', `${reason}. Đã thử tự khởi động lại ${TTS_MAX_AUTO_RESTARTS} lần không thành công, DỪNG tự động retry (tránh vòng lặp vô hạn). Dùng nút "Khởi động lại ZeroTTS" trên dashboard Admin để thử lại thủ công.`);
    }
    broadcastNotification('tts.status', this.getStatus());
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        this.restartAttempts = 0; // worker khỏe mạnh trở lại -> reset bộ đếm retry liên tiếp
        logLine('INFO', 'ZeroTTS', `Sẵn sàng sau ${msg.loadSec}s! Giọng: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        logLine('ERROR', 'ZeroTTS', String(msg.error));
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: state.settings.ttsVoice || this.voice || 'maichi',
      voices: this.voices,
      model: this.model,
      pendingRequests: this.pending.size,
      restartAttempts: this.restartAttempts
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = (voiceOverride || state.settings.ttsVoice || 'maichi').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS đang ở trạng thái: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI CHÙA ONLINE & BẢNG VÀNG CÔNG ĐỨC
// ============================================================================
const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  haloIntensity: 0.45,
  offerings: {
    lotus: 3,
    fruit: 2,
    lamp: 2,
    dragon: 1
  },
  devotees: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500,
    mockLiveEnabled: false,
    interactionsEnabled: true,
    autoFortuneOnRoseEnabled: true,
    // Mục 11 (Admin nâng cấp hiển thị/hiệu ứng) — xem getPublicState() cho vipMaxSeats
    // và public/js/live.js (applyDisplaySettings) cho cách các cờ này được áp dụng.
    vipEffectsEnabled: true,
    vipEffectIntensity: 'normal', // 'low' | 'normal' | 'high'
    vipMaxSeats: 6, // kẹp 4–6 ở getPublicState(), không cho vượt quá 6 toạ độ bục đã dựng sẵn
    regularNameplatesEnabled: true,
    guidanceHintsEnabled: true,
    ambientEffectsEnabled: true,
    reducedEffectsMode: false
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: {
          ...DEFAULT_STATE.settings,
          ...(saved.settings || {}),
          // autoSim/mockLiveEnabled là công tắc TẠM THỜI cho phiên kiểm thử hiện tại, không
          // phải tuỳ chọn lâu dài — nếu khôi phục nguyên giá trị đã lưu (ví dụ còn "true" từ
          // lần test trước khi tắt server), getLeaderboard() sẽ lại cho hiện các thí chủ MOCK/
          // AutoSim cũ ngay khi LIVE khởi động, đúng lỗi mà vận hành thật cần tránh. Luôn reset
          // về false mỗi lần khởi động (giống cách tiktok.connected reset ở dưới) — Admin phải
          // chủ động bật lại nếu muốn kiểm thử trong phiên mới.
          autoSim: false,
          mockLiveEnabled: false
        },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được merit-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      activeIncenseSticks: state.activeIncenseSticks,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1200);
}

// Thí chủ tạo bởi Mock Live ("mock_*", xem MOCK_VIEWER_POOL) hoặc bởi AutoSim
// (SIM_DEVOTEES) KHÔNG được hiển thị trong bảng TẤM LÒNG THÀNH / đạo tràng / đệm VIP
// của LIVE thật — dù dữ liệu đó đã được lưu lại từ lần kiểm thử trước và server vừa
// khởi động lại (saveState() lưu toàn bộ state.devotees, không phân biệt nguồn), vì
// hai cờ bật/tắt dưới đây luôn reset về false khi khởi động (xem DEFAULT_STATE) nên
// ghế/bảng xếp hạng vẫn TRỐNG cho tới khi có người xem thật tương tác. Bật lại
// mockLiveEnabled/autoSim để xem đúng dữ liệu giả đang kiểm thử (có nhãn MOCK_ rõ
// ràng với Mock Live); KHÔNG xoá dữ liệu — chỉ ẩn khỏi màn hình LIVE thật.
function isMockOrSimDevotee(uniqueId) {
  const uid = String(uniqueId || '');
  return uid.startsWith('mock_') || SIM_DEVOTEE_UNIQUE_IDS.has(uid);
}

function getVisibleDevotees() {
  const showMock = Boolean(state.settings.mockLiveEnabled) || Boolean(state.settings.autoSim);
  return Object.values(state.devotees).filter((d) => showMock || !isMockOrSimDevotee(d.uniqueId));
}

function toPublicDevotee(d, rank) {
  // Dữ liệu cũ có thể chưa có appearance/roseCount. Chỉ bổ sung fallback an toàn,
  // không suy đoán quà thường là Hoa Hồng vì field gifts còn chứa nhiều loại quà khác.
  if (!d.appearance) d.appearance = rollAppearance(d.uniqueId, d.name);
  const roseCount = Math.max(0, Number(d.roseCount) || 0);
  return {
    rank,
    name: d.name,
    uniqueId: d.uniqueId,
    avatar: d.avatar || '',
    merit: Number(d.merit) || 0,
    incense: Number(d.incense) || 0,
    gifts: Number(d.gifts) || 0,
    roseCount,
    lastRoseAt: d.lastRoseAt || null,
    isRoseDonor: roseCount > 0,
    lastWish: d.lastWish || '',
    // Mục 6 "ưu tiên dễ đọc hơn số lượng" — client dùng field này để chỉ hiện đầy đủ
    // nameplate (avatar + tên) cho vài người VỪA tương tác, thu gọn người còn lại
    // (xem renderSeatBadge trong live.js). Thí chủ cũ phục hồi từ merit-state.json
    // trước khi có field này sẽ có giá trị null -> client coi như "không hoạt động".
    lastActiveAt: d.lastActiveAt || null,
    appearance: d.appearance
  };
}

function getLeaderboard(limit = 6) {
  return getVisibleDevotees()
    .sort((a, b) => (Number(b.merit) || 0) - (Number(a.merit) || 0))
    .slice(0, limit)
    .map((d, index) => toPublicDevotee(d, index + 1));
}

// Bố trí ghế tách biệt với bảng TẤM LÒNG THÀNH:
// - VIP: chỉ người đã tặng Rose, ưu tiên tổng Rose rồi lần tặng gần nhất.
// - Thường: mọi người còn lại theo công đức; loại đúng 6 người đang ngồi VIP để
//   không render trùng một người ở cả hai tầng. Donor vượt quá 6 chỗ vẫn được ngồi
//   dưới và giữ cờ isRoseDonor để client có thể gắn dấu Hoa Hồng nhỏ.
function getSeatingState(vipLimit = 6, regularLimit = 40) {
  const visible = getVisibleDevotees();
  const vipRows = visible
    .filter((d) => (Number(d.roseCount) || 0) > 0)
    .sort((a, b) => {
      const roseDelta = (Number(b.roseCount) || 0) - (Number(a.roseCount) || 0);
      if (roseDelta !== 0) return roseDelta;
      const recentDelta = (Date.parse(b.lastRoseAt) || 0) - (Date.parse(a.lastRoseAt) || 0);
      if (recentDelta !== 0) return recentDelta;
      return (Number(b.merit) || 0) - (Number(a.merit) || 0);
    })
    .slice(0, vipLimit);

  const vipSet = new Set(vipRows);
  const regularRows = visible
    .filter((d) => !vipSet.has(d))
    .sort((a, b) => (Number(b.merit) || 0) - (Number(a.merit) || 0))
    .slice(0, regularLimit);

  return {
    vip: vipRows.map((d, index) => toPublicDevotee(d, index + 1)),
    regular: regularRows.map((d, index) => toPublicDevotee(d, index + 1)),
    vipCapacity: vipLimit,
    regularCapacity: regularLimit
  };
}
// Bộ lọc chặn ký tự lạ (Cuneiform 𒐫, Zalgo, Braille, ký tự spam) & từ ngữ phản cảm
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)/i;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'Thí Chủ Hữu Duyên';
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return 'Thí Chủ Hữu Duyên';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

// ============================================================================
// 3B. HỆ THỐNG NGOẠI HÌNH NHÂN VẬT (CHARACTER APPEARANCE SYSTEM)
// ============================================================================
// Vì toàn bộ 8 khung hình sprite hiện có (public/assets/devotee*.png) là ảnh phẳng
// đã "nướng" sẵn dáng người + tóc + trang phục vào làm MỘT, không có lớp tóc/trang
// phục tách riêng để đổi hình dạng thật sự — hệ thống này quản lý 1 biến thể TRANG
// PHỤC (lọc màu CSS áp cho toàn sprite, xem outfitId) và 1 biến thể PHỤ KIỆN TÓC
// (hình khối CSS nhỏ chồng đúng vị trí búi tóc, xem hairId, chỉ áp cho avatar NGỒI
// quay lưng tĩnh — không áp cho Chủ Lễ đang chuyển động qua nhiều tư thế để tránh
// lệch/nổi qua vai như yêu cầu). avatarScale thêm một chút khác biệt vóc dáng nhẹ.
// Toàn bộ 3 giá trị được "gieo" (seed) MỘT LẦN DUY NHẤT từ uniqueId khi tạo thí chủ
// mới (xem recordDevotee) rồi lưu cố định vào state.devotees[key].appearance — đảm
// bảo cùng một người xem quay lại luôn giữ đúng ngoại hình, không đổi khi refresh.
const OUTFIT_VARIANTS = [
  { id: 0, name: 'Áo Lam Truyền Thống', cssClass: 'outfit-0' },
  { id: 1, name: 'Áo Tràng Xám Nhạt', cssClass: 'outfit-1' },
  { id: 2, name: 'Trang Phục Trắng Ngà', cssClass: 'outfit-2' },
  { id: 3, name: 'Áo Nâu Nhạt', cssClass: 'outfit-3' },
  { id: 4, name: 'Trang Phục Be/Kem', cssClass: 'outfit-4' },
  { id: 5, name: 'Áo Lễ Khăn Choàng', cssClass: 'outfit-5' }
];
const HAIR_VARIANTS = [
  { id: 0, name: 'Tóc Ngắn Đen', cssClass: 'hair-0' },
  { id: 1, name: 'Tóc Dài Buộc Gọn', cssClass: 'hair-1' },
  { id: 2, name: 'Tóc Búi Cao', cssClass: 'hair-2' },
  { id: 3, name: 'Tóc Bạc/Hoa Râm', cssClass: 'hair-3' },
  { id: 4, name: 'Đầu Cạo', cssClass: 'hair-4' },
  { id: 5, name: 'Khăn Trùm Đầu', cssClass: 'hair-5' }
];

// Hash chuỗi -> số nguyên dương ổn định (FNV-1a rút gọn) — KHÔNG dùng Math.random(),
// để cùng một uniqueId luôn ra đúng cùng 1 kết quả trên mọi lần chạy/mọi máy chủ.
function hashUniqueIdToInt(str) {
  let h = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Sinh ngoại hình ổn định cho 1 uniqueId — KHÔNG suy đoán giới tính/đặc điểm cá nhân
// thực tế từ nickname, chỉ chọn đều trong bộ biến thể trung tính bằng hash số học.
function rollAppearance(uniqueId, displayName) {
  const seed = hashUniqueIdToInt(uniqueId || displayName || Math.random().toString(36));
  const outfitId = seed % OUTFIT_VARIANTS.length;
  const hairId = Math.floor(seed / OUTFIT_VARIANTS.length) % HAIR_VARIANTS.length;
  // Dao động vóc dáng nhẹ ±6% quanh 1.0, tách bạch khỏi outfit/hair để không lặp
  // chu kỳ trùng với chúng (dùng số nguyên tố khác làm bước chia thứ 3).
  const scaleSteps = Math.floor(seed / (OUTFIT_VARIANTS.length * HAIR_VARIANTS.length)) % 13;
  const avatarScale = +(0.94 + (scaleSteps / 12) * 0.12).toFixed(3);
  return { outfitId, hairId, avatarScale };
}

function recordDevotee(user, uniqueId, avatar, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      roseCount: 0,
      lastRoseAt: null,
      lastActiveAt: null,
      lastWish: '',
      // Gieo ngoại hình đúng 1 LẦN tại đây — các lần recordDevotee() sau cho cùng
      // key chỉ cập nhật merit/avatar/lastWish, KHÔNG bao giờ gieo lại appearance.
      appearance: rollAppearance(uniqueId || displayName, displayName)
    };
  }
  const dev = state.devotees[key];
  // Thí chủ cũ được nạp lại từ merit-state.json (trước khi có hệ thống ngoại hình
  // này) chưa có appearance -> gieo bổ sung đúng 1 lần tại đây, sau đó giữ cố định
  // như mọi thí chủ khác (saveState() sẽ ghi lại field này vào file).
  if (!dev.appearance) {
    dev.appearance = rollAppearance(dev.uniqueId || key, dev.name);
  }
  if (!Number.isFinite(Number(dev.roseCount))) dev.roseCount = 0;
  if (typeof dev.lastRoseAt !== 'string') dev.lastRoseAt = null;
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += meritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;
  // Mọi tương tác thật (bình luận, nghi thức, quà) đều đi qua recordDevotee() nên đây
  // là đúng 1 nơi cập nhật "vừa hoạt động" cho mục đích thu gọn nameplate phía client.
  dev.lastActiveAt = new Date().toISOString();

  state.totalMerit += meritDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalMerit % 1000) / 1400);
  return dev;
}

function recordRoseDonation(ctx, count) {
  const roseCount = Math.max(1, Math.floor(Number(count) || 1));
  const devotee = recordDevotee(ctx.user, ctx.uniqueId, ctx.avatar, 0, 0, 0, '');
  devotee.roseCount = Math.max(0, Number(devotee.roseCount) || 0) + roseCount;
  devotee.lastRoseAt = new Date().toISOString();
  saveState();
  return devotee;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

// recentEvents được gửi lại cho MỌI client qua broadcastNotification() trên MỌI sự kiện
// nghi thức (đo thực tế: ~86% dung lượng mỗi gói WebSocket). Nhưng public/js/live.js chỉ
// dùng recentEvents để hiển thị dòng tóm tắt ngắn trong "event feed" (formatEventSummary) —
// không bao giờ đọc ttsText hay fortune.poem/meaning từ recentEvents (phần đó luôn đến từ
// field `event` riêng của chính sự kiện mới nhất trong cùng broadcast, không đổi ở đây).
// Vì vậy chỉ gửi đúng các field feed cần hiển thị, giảm đáng kể kích thước gói tin mà
// không mất dữ liệu hay chức năng nào đang hoạt động.
function summarizeEventForFeed(ev) {
  const slim = {
    id: ev.id,
    timestamp: ev.timestamp,
    type: ev.type,
    user: ev.user,
    merit: ev.merit
  };
  if (ev.count !== undefined) slim.count = ev.count;
  if (ev.wish !== undefined) slim.wish = ev.wish;
  if (ev.giftName !== undefined) slim.giftName = ev.giftName;
  if (ev.comment !== undefined) slim.comment = ev.comment;
  if (ev.fortune) slim.fortune = { number: ev.fortune.number, rank: ev.fortune.rank };
  return slim;
}

function getPublicState() {
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    // 6 đệm VIP + tối đa 40 chỗ đạo tràng (xem HALL_SEAT_COORDS trong live.js) = 46,
    // để mọi chỗ ngồi có thể được lấp bởi người xem THẬT khi đạo tràng đông đủ, thay
    // vì cắt bớt ở 24 và buộc client phải tự vẽ thêm avatar giả cho các ghế còn lại.
    leaderboard: getLeaderboard(46),
    // vipMaxSeats chỉnh được từ Admin (mục 11), kẹp 4–6 theo đúng khoảng "4–6 vị trí"
    // trong tài liệu thiết kế — client (VIP_CUSHION_COORDS trong live.js) vẫn luôn có
    // sẵn 6 toạ độ bục, slot thừa chỉ đơn giản không có donor nên không vẽ (xem renderVipCushions).
    seating: getSeatingState(Math.max(4, Math.min(6, Number(state.settings.vipMaxSeats) || 6)), 40),
    recentEvents: state.recentEvents.slice(0, 15).map(summarizeEventForFeed),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'maichi' },
    roseFortune: getRoseFortunePublicStats(),
    health: {
      uptimeSec: Math.floor((Date.now() - BOOT_TIME) / 1000),
      wsClients: wss ? wss.clients.size : 0,
      devoteeCount: Object.keys(state.devotees).length
    },
    errorLog: errorLog.slice(0, 20)
  };
}

// ============================================================================
// 4. NGHI THỨC TƯƠNG TÁC (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
    const merit = count * 5;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const devotee = recordDevotee(user, uniqueId, avatar, merit, count, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${devotee.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`;

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const merit = count;

    state.woodenFishHits += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0);

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      count,
      merit,
      ttsText: params.ttsText || ''
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
    const merit = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, wish);

    const ttsText = params.readTts
      ? `Thí chủ ${devotee.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
    const merit = 10;

    state.lanternCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 1, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Lời cầu nguyện của thí chủ ${devotee.name}: ${wish}. Nam mô A Di Đà Phật.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      wish,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // Nghi thức "Dâng hoa" — kích hoạt khi 1 lượt/combo Rose kết thúc với TỔNG đúng 1 Hoa Hồng
  // (xem dispatchRoseThreshold). Avatar rời chỗ ngồi lên chính điện dâng bó hoa ngắn gọn
  // (~2 giây) rồi trở lại chỗ ngồi — tái sử dụng animateWalkerOnCarpet hiện có bên live.js.
  offerFlower(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const merit = 15;

    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 1, '');

    const ttsText = `Cảm ơn bạn ${devotee.name} đã dâng hoa. Chúc bạn một ngày an lành.`;

    const event = pushEventLog({
      type: 'offerFlower',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      merit,
      visualDurationMs: 2000,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // Nghi thức "Cầu phúc" — kích hoạt khi 1 lượt/combo Rose kết thúc với TỔNG đúng 5 Hoa Hồng.
  // Avatar lên chính điện, hiệu ứng ánh sáng nhẹ + hoa trong ~3 giây (tái sử dụng beam/halo
  // flare sẵn có trong updateCentralWorshipper), rồi trở lại chỗ ngồi.
  blessingRose(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const merit = 40;

    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 1, '');

    const ttsText = `Bạn ${devotee.name} vừa gửi lời cầu phúc. Chúc bạn và gia đình luôn bình an.`;

    const event = pushEventLog({
      type: 'blessingRose',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      merit,
      visualDurationMs: 3000,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'Đài Hoa Sen Vàng',
      fruit: 'Mâm Ngũ Quả Cát Tường',
      lamp: 'Đèn Lưu Ly Trí Tuệ',
      dragon: 'Đại Lễ Kim Long Chầu Phật'
    };
    const giftName = params.giftName || giftLabels[giftType];
    const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
    const merit = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const wish = params.wish || `Dâng cúng ${giftName} lên Tam Bảo`;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 3, 1, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý.`;

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      giftType,
      giftName,
      coins,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'Gia đạo, Tài lộc và Bình an';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const merit = 10;

    state.fortuneCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);

    const ttsText = params.readTts === false
      ? ''
      : `Thí chủ ${devotee.name} vừa gieo được ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      appearance: devotee.appearance,
      topic,
      fortune,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'Đại Lễ Hào Quang Vạn Trượng'
    });
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;
// "Thế hệ" kết nối hiện tại — tăng lên mỗi lần connectTikTokLive()/disconnectTikTokLive()
// được gọi. Các listener (CONNECTED/DISCONNECTED/ERROR) gắn vào MỘT tiktokConn cụ thể
// đóng (closure) giá trị thế hệ lúc tạo ra nó; nếu thế hệ đó đã bị thay thế (người dùng
// bấm Connect sang tài khoản khác, hoặc Disconnect) trước khi sự kiện cũ (ví dụ
// 'disconnected' từ lần disconnect() dọn dẹp connection cũ) kịp bắn ra, listener sẽ tự
// bỏ qua — tránh ghi đè state.tiktok bằng dữ liệu của kết nối đã lỗi thời, và tránh lên
// lịch tự động kết nối lại (xem scheduleTikTokReconnect) cho một kết nối không còn ai cần.
let tiktokConnGeneration = 0;
let tiktokIntentionalDisconnect = false;
let tiktokReconnectTimer = null;
let tiktokReconnectAttempts = 0;
const TIKTOK_MAX_AUTO_RECONNECTS = 5;
// Cho phép ghi đè qua biến môi trường CHỈ để automated test chạy nhanh (mặc định 15s khi
// vận hành thật, tăng gấp đôi mỗi lần, tối đa 5 phút).
const TIKTOK_RECONNECT_BASE_MS = Number(process.env.TIKTOK_RECONNECT_BASE_MS) || 15000;
const TIKTOK_RECONNECT_MAX_MS = Number(process.env.TIKTOK_RECONNECT_MAX_MS) || 5 * 60 * 1000;

function clearTikTokReconnectTimer() {
  if (tiktokReconnectTimer) {
    clearTimeout(tiktokReconnectTimer);
    tiktokReconnectTimer = null;
  }
}

/**
 * Tự động kết nối lại khi mất kết nối ngoài ý muốn (rớt mạng, TikTok rate-limit dịch vụ
 * ký request, streamer tạm ngắt...) — dùng backoff tăng dần (15s -> 30s -> ... tối đa 5
 * phút) và dừng hẳn sau TIKTOK_MAX_AUTO_RECONNECTS lần để không tự ý "dội bom" dịch vụ ký
 * của TikTok (chính nguyên nhân gây lỗi "rate_limit_account_minute" đã gặp trong vận hành
 * thật). Sau khi hết lượt, cần bấm nút "Kết nối" trên dashboard Admin để thử lại thủ công.
 */
function scheduleTikTokReconnect(username) {
  if (tiktokIntentionalDisconnect || tiktokReconnectTimer || !username) return;
  if (tiktokReconnectAttempts >= TIKTOK_MAX_AUTO_RECONNECTS) {
    logLine('ERROR', 'TikTok', `Đã tự động kết nối lại ${TIKTOK_MAX_AUTO_RECONNECTS} lần không thành công cho @${username}. DỪNG tự động retry (tránh bị giới hạn tốc độ từ dịch vụ ký của TikTok). Dùng nút "Kết nối" trên dashboard Admin để thử lại thủ công.`);
    return;
  }
  tiktokReconnectAttempts += 1;
  const delayMs = Math.min(TIKTOK_RECONNECT_MAX_MS, TIKTOK_RECONNECT_BASE_MS * Math.pow(2, tiktokReconnectAttempts - 1));
  logLine('WARN', 'TikTok', `Mất kết nối phòng Live @${username}. Tự động kết nối lại lần ${tiktokReconnectAttempts}/${TIKTOK_MAX_AUTO_RECONNECTS} sau ${Math.round(delayMs / 1000)}s...`);
  tiktokReconnectTimer = setTimeout(() => {
    tiktokReconnectTimer = null;
    connectTikTokLive(username, { isAutoRetry: true }).catch(() => {
      // Lỗi đã được ghi log & lưu vào state.tiktok.lastError trong connectTikTokLive();
      // ở đây chỉ cần lên lịch thử lại tiếp (connectTikTokLive gọi scheduleTikTokReconnect
      // khi connect() thất bại, nên KHÔNG tự gọi lại ở đây để tránh lên lịch đôi).
    });
  }, delayMs);
}

// Gắn nhãn nguồn sự kiện (TikTok thật vs Mock Live) cho logging — Mock Live luôn dùng
// uniqueId tiền tố "mock_" (xem MOCK_VIEWER_POOL), nên không bao giờ trùng với uniqueId
// thật của TikTok, dùng được an toàn làm dấu hiệu phân biệt.
function eventSourceTag(uniqueId) {
  return String(uniqueId || '').startsWith('mock_') ? 'MOCK' : 'REAL';
}

// Cảnh báo (gộp, tối đa 1 lần/60s) khi sự kiện người xem bị bỏ qua vì tương tác đang bị
// tạm dừng (system.setInteractionsEnabled false) — tránh spam log nhưng vẫn đảm bảo nguyên
// nhân "chùa không phản hồi" do quên bật lại tương tác sau khi test sẽ hiện rõ trong log
// & dashboard Admin (mục Nhật ký lỗi) thay vì bị âm thầm bỏ qua không dấu vết.
let lastInteractionsPausedLogTs = 0;
function noteInteractionDroppedWhilePaused(kind) {
  const now = Date.now();
  if (now - lastInteractionsPausedLogTs < 60000) return;
  lastInteractionsPausedLogTs = now;
  logLine('WARN', 'TikTok', `Sự kiện '${kind}' từ người xem bị BỎ QUA vì tương tác đang TẠM DỪNG (interactionsEnabled=false). Vào dashboard Admin > mục Vận Hành & Giám Sát để bật lại nếu đây không phải chủ ý.`);
}

const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  // Chống 1 người spam bình luận liên tục làm nghẽn hàng đợi TTS (cooldown 3.5 giây/người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);

  // Bình luận CHỈ đưa người xem vào chùa (vào chỗ ngồi còn trống, hiển thị nickname + nội
  // dung bình luận) — KHÔNG tự kích hoạt bất kỳ nghi thức trả quà nào (dâng hương, xin xăm,
  // cầu phúc, thỉnh chuông, gõ mõ...) dù bình luận chứa từ khóa trùng tên nghi thức. Chỉ quà
  // Hoa Hồng (xem dispatchRoseThreshold) mới kích hoạt 3 nghi thức Dâng hoa/Cầu phúc/Xin xăm.
  // meritDelta = 0: bình luận không tạo công đức, tránh lẫn với nguồn công đức chính (Rose).
  const devotee = recordDevotee(cleanUser, uniqueId, avatar, 0, 0, 0, cleanWish);
  const event = pushEventLog({
    type: 'viewerComment',
    user: devotee.name,
    uniqueId: devotee.uniqueId,
    avatar: devotee.avatar,
    comment: cleanWish,
    merit: 0
  });
  saveState();
  broadcastNotification('temple.event', { event, state: getPublicState() });
  return { event, state: getPublicState() };
}

// Idempotency cho Gift Combo: mỗi groupId theo dõi { maxCount, ended, endedAt, lastSeen }.
// - maxCount : repeatCount cao nhất đã được quy đổi công đức cho combo này.
// - ended    : combo đã nhận sự kiện kết thúc (repeatEnd) hay chưa.
// - endedAt  : thời điểm combo kết thúc — dùng để phân biệt sự kiện trùng/đến muộn của
//              combo CŨ với một combo MỚI của cùng người xem, khi TikTok không cung cấp
//              groupId riêng cho từng combo (phải dùng key dự phòng uniqueId+giftId).
// - lastSeen : thời điểm cập nhật gần nhất, dùng để dọn các combo "treo" (không bao giờ
//              nhận được repeatEnd, ví dụ do mất kết nối giữa combo) tránh rò rỉ bộ nhớ.
const giftComboTracker = new Map();
const GIFT_COMBO_FINALIZE_GRACE_MS = 3000; // chịu được trùng lặp/đến muộn trong khoảng này sau khi combo kết thúc
// Cho phép ghi đè qua biến môi trường CHỈ để automated test chạy nhanh (mặc định 2 phút khi
// vận hành thật).
const GIFT_COMBO_STALE_MS = Number(process.env.GIFT_COMBO_STALE_MS) || 2 * 60 * 1000;
const GIFT_COMBO_CLEANUP_TICK_MS = Number(process.env.GIFT_COMBO_CLEANUP_TICK_MS) || 30000;

const giftComboCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of giftComboTracker) {
    if (now - entry.lastSeen > GIFT_COMBO_STALE_MS) {
      // Combo Rose không bao giờ nhận được tín hiệu kết thúc (repeatEnd) — ví dụ do mất kết
      // nối TikTok giữa combo — vẫn phải xử lý với tổng số Rose đã ghi nhận được thay vì âm
      // thầm xóa, tránh bỏ sót quà hợp lệ người xem đã thật sự gửi (yêu cầu minh bạch).
      if (entry.isRose && !entry.thresholdDispatched && entry.ctx) {
        entry.thresholdDispatched = true;
        logLine(
          'WARN',
          'RoseFortune',
          `Combo Rose của ${entry.ctx.user} không nhận được tín hiệu kết thúc sau ${Math.round(GIFT_COMBO_STALE_MS / 60000)} phút -> xử lý với tổng ${entry.maxCount} Rose đã ghi nhận được.`
        );
        dispatchRoseThreshold(entry.maxCount, entry.ctx);
      }
      giftComboTracker.delete(key);
    }
  }
}, GIFT_COMBO_CLEANUP_TICK_MS);

function toPositiveInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live cần kết nối');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Thí Chủ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

// Cổng bật/tắt tương tác từ TikTok LIVE/Mock Live (dashboard Admin, mục "Vận Hành & Giám Sát").
// Khi tắt: sự kiện người xem thật/mock bị bỏ qua hoàn toàn, nhưng RPC thao tác thủ công
// từ Admin (gọi thẳng Rituals.*) vẫn hoạt động bình thường.
function interactionsAreEnabled() {
  return state.settings.interactionsEnabled !== false;
}

// ============================================================================
// 5C. HOA HỒNG (ROSE) THEO MỐC 1 / 5 / 10 — DÂNG HOA / CẦU PHÚC / XIN XĂM
// ============================================================================
// Nhận diện quà "Rose": ưu tiên giftId 5655 — ID công khai, được xác nhận rộng rãi trong
// cộng đồng tiktok-live-connector cho quà "Rose" (giá 1 xu, quà rẻ nhất trên TikTok) — kèm
// fallback theo diamondCount === 1 (Rose là quà DUY NHẤT có giá 1 xu trên TikTok ở thời điểm
// viết code này). KHÔNG dựa vào tên hiển thị (có thể đổi theo ngôn ngữ phòng Live). Mọi sự
// kiện GIFT thật đều được ghi log đầy đủ giftId/tên qua handleGiftEvent (xem logLine
// '[GIFT][REAL]...') — nếu TikTok phát sinh thêm quà 1-xu khác trong tương lai, hãy đối
// chiếu log thật đó rồi cập nhật ROSE_GIFT_ID cho chính xác.
const ROSE_GIFT_ID = '5655';
function isRoseGift(giftObj, giftId) {
  const idStr = String(giftId || giftObj?.id || '').trim();
  if (idStr && idStr === ROSE_GIFT_ID) return true;
  const diamonds = Number(giftObj?.diamondCount);
  return Number.isFinite(diamonds) && diamonds === 1;
}

// Mốc số Rose -> nghi thức tương ứng. Cấu hình rõ ràng, không đoán: TỔNG số Rose cuối cùng
// của 1 lượt/combo phải khớp CHÍNH XÁC 1 trong 3 mốc dưới đây. Số lượng khác (2,3,4,6..9,
// 11+...) rơi vào nhánh fallback (xem dispatchRoseThreshold) — vẫn ghi nhận công đức như quà
// thường, không tự suy đoán gán vào nghi thức nào.
const ROSE_THRESHOLD_RITUALS = { 1: 'offerFlower', 5: 'blessingRose', 10: 'drawFortune' };

// Hàng đợi nghi thức Rose — xử lý TUẦN TỰ, mỗi lần đúng 1 nghi thức, cách nhau
// ROSE_FORTUNE_DISPATCH_INTERVAL_MS để khớp với hoạt cảnh + giọng đọc ZeroTTS hiện có (vốn
// chỉ có 1 "chỗ" hiển thị Chủ Lễ trung tâm — xem updateCentralWorshipper trong live.js),
// tránh nhiều người chồng lên nhau khi nhiều lượt Rose đổ về cùng lúc.
// Hàng đợi này CHỈ tồn tại trong bộ nhớ (không ghi vào merit-state.json) — khi restart
// server, hàng đợi rỗng lại từ đầu, KHÔNG phát lại các yêu cầu đã xử lý/đang chờ trước đó.
// Nghi thức xin xăm bằng bình luận KHÔNG còn tồn tại (bình luận chỉ đưa người xem vào chùa,
// xem parseViewerComment) nên không có xung đột hàng đợi giữa 2 nguồn.
const ROSE_FORTUNE_QUEUE_MAX = 300;
// Cho phép ghi đè qua biến môi trường CHỈ để automated test chạy nhanh (mặc định 6000ms khi
// vận hành thật — đủ cho hoạt cảnh Dâng hoa/Cầu phúc ngắn lẫn Xin xăm dài hơn).
const ROSE_FORTUNE_DISPATCH_INTERVAL_MS = Number(process.env.ROSE_FORTUNE_INTERVAL_MS) || 6000;
const roseFortuneQueue = [];
let roseFortuneTimer = null;
function freshRitualTally() {
  return { real: 0, mock: 0 };
}
const roseFortuneStats = {
  realRosesReceived: 0,
  mockRosesReceived: 0,
  overflowDropped: 0,
  completed: {
    offerFlower: freshRitualTally(),
    blessingRose: freshRitualTally(),
    drawFortune: freshRitualTally(),
    offerGiftFallback: freshRitualTally()
  },
  recentLog: []
};

function roseFortuneAutoEnabled() {
  return state.settings.autoFortuneOnRoseEnabled !== false;
}

function clearRoseFortuneTimer() {
  if (roseFortuneTimer) {
    clearTimeout(roseFortuneTimer);
    roseFortuneTimer = null;
  }
}

function scheduleRoseFortuneTick(delayMs) {
  if (roseFortuneTimer) return;
  roseFortuneTimer = setTimeout(() => {
    roseFortuneTimer = null;
    processRoseFortuneQueue();
  }, delayMs);
}

const RITUAL_LABELS = {
  offerFlower: 'Dâng hoa',
  blessingRose: 'Cầu phúc',
  drawFortune: 'Xin xăm',
  offerGiftFallback: 'Dâng quà (số Rose không khớp mốc 1/5/10)'
};

function dispatchQueuedRitual(item) {
  const { ritual, ctx, count } = item;
  const params = { user: ctx.user, uniqueId: ctx.uniqueId, avatar: ctx.avatar };
  switch (ritual) {
    case 'offerFlower':
      Rituals.offerFlower(params);
      break;
    case 'blessingRose':
      Rituals.blessingRose(params);
      break;
    case 'drawFortune':
      Rituals.drawFortune({ ...params, topic: 'Lộc Hoa Hồng tâm thành' });
      break;
    case 'offerGiftFallback':
      Rituals.offerGift({
        ...params,
        coins: count,
        giftName: `${count}x Hoa Hồng`,
        wish: `Thành tâm dâng ${count} Hoa Hồng kính lễ Đức Phật A Di Đà`
      });
      break;
    default:
      logLine('ERROR', 'RoseFortune', `Loại nghi thức không xác định trong hàng đợi: ${ritual}`);
  }
}

function processRoseFortuneQueue() {
  const item = roseFortuneQueue.shift();
  if (!item) return;
  try {
    dispatchQueuedRitual(item);
    const tally = roseFortuneStats.completed[item.ritual] || (roseFortuneStats.completed[item.ritual] = freshRitualTally());
    if (item.source === 'MOCK') tally.mock += 1;
    else tally.real += 1;
    roseFortuneStats.recentLog.unshift({
      timestamp: new Date().toISOString(),
      user: item.ctx.user,
      source: item.source,
      ritual: item.ritual,
      ritualLabel: RITUAL_LABELS[item.ritual] || item.ritual,
      count: item.count
    });
    if (roseFortuneStats.recentLog.length > 20) roseFortuneStats.recentLog.length = 20;
  } catch (e) {
    logLine('ERROR', 'RoseFortune', `Lỗi khi thực hiện nghi thức '${item.ritual}' cho ${item.ctx.user}: ${e.message}`);
  }
  broadcastNotification('temple.state', getPublicState());
  if (roseFortuneQueue.length > 0) {
    scheduleRoseFortuneTick(ROSE_FORTUNE_DISPATCH_INTERVAL_MS);
  }
}

// Thêm đúng 1 nghi thức vào hàng đợi cho 1 lượt/combo Rose đã HOÀN TẤT. Nếu hàng đợi đã đầy,
// KHÔNG âm thầm bỏ qua: ghi log ERROR rõ ràng + đếm vào overflowDropped để dashboard Admin
// hiển thị minh bạch, vì đây tương ứng với quà THẬT người xem đã trả tiền.
function enqueueRoseRitual(ritual, ctx, count) {
  const source = eventSourceTag(ctx.uniqueId);
  if (roseFortuneQueue.length >= ROSE_FORTUNE_QUEUE_MAX) {
    roseFortuneStats.overflowDropped += 1;
    logLine('ERROR', 'RoseFortune', `Hàng đợi nghi thức Rose đã đầy (tối đa ${ROSE_FORTUNE_QUEUE_MAX}) — nghi thức '${ritual}' của ${ctx.user} (${source}) bị từ chối thêm vào. Tổng đã quá tải: ${roseFortuneStats.overflowDropped}.`);
    broadcastNotification('temple.state', getPublicState());
    return;
  }
  roseFortuneQueue.push({ ritual, ctx, count, source, enqueuedAt: Date.now() });
  logLine('INFO', 'RoseFortune', `[${source}] ${ctx.user} hoàn tất ${count} Hoa Hồng -> xếp hàng nghi thức '${RITUAL_LABELS[ritual] || ritual}' (đang chờ: ${roseFortuneQueue.length}).`);
  broadcastNotification('temple.state', getPublicState());
  scheduleRoseFortuneTick(0);
}

// Quyết định nghi thức dựa trên TỔNG SỐ Rose cuối cùng của 1 lượt/combo đã HOÀN TẤT (không
// đoán giữa chừng khi combo đang tăng dần — xem lời gọi trong handleGiftEvent/cleanup bên
// dưới, chỉ gọi hàm này khi combo đã kết thúc hoặc hết hạn chờ).
function dispatchRoseThreshold(count, ctx) {
  const normalizedCount = Math.max(1, Math.floor(Number(count) || 1));
  const normalizedCtx = ctx;
  const source = eventSourceTag(normalizedCtx.uniqueId);

  // roseCount đã được cộng chính xác theo delta ngay khi nhận event (handleGiftEvent).
  // Tắt tự động chỉ bỏ qua hoạt cảnh/TTS; donor state vẫn được broadcast ở đây.
  if (!roseFortuneAutoEnabled()) {
    broadcastNotification('temple.state', getPublicState());
    return;
  }

  const ritual = ROSE_THRESHOLD_RITUALS[normalizedCount];

  if (!ritual) {
    logLine(
      'WARN',
      'RoseFortune',
      `[${source}] ${normalizedCtx.user} tặng tổng ${normalizedCount} Hoa Hồng (không khớp mốc 1/5/10) -> ghi nhận công đức như quà thường, không kích hoạt riêng Dâng hoa/Cầu phúc/Xin xăm.`
    );
    enqueueRoseRitual('offerGiftFallback', normalizedCtx, normalizedCount);
    return;
  }
  enqueueRoseRitual(ritual, normalizedCtx, normalizedCount);
}

function getRoseFortunePublicStats() {
  return {
    enabled: roseFortuneAutoEnabled(),
    pending: roseFortuneQueue.length,
    realRosesReceived: roseFortuneStats.realRosesReceived,
    mockRosesReceived: roseFortuneStats.mockRosesReceived,
    overflowDropped: roseFortuneStats.overflowDropped,
    completed: roseFortuneStats.completed,
    recentLog: roseFortuneStats.recentLog.slice(0, 10)
  };
}

function handleMemberEvent(data) {
  if (!interactionsAreEnabled()) return noteInteractionDroppedWhilePaused('member');
  const { user, uniqueId, avatar } = extractUserFromEvent(data);
  recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'Đã vào Chánh Điện lễ Phật');
  broadcastNotification('temple.state', getPublicState());
}

function handleChatEvent(data) {
  if (!interactionsAreEnabled()) return noteInteractionDroppedWhilePaused('chat');
  const { user, uniqueId, avatar } = extractUserFromEvent(data);
  const commentText = data?.content || data?.comment || '';
  logLine('INFO', 'TikTok', `[CHAT][${eventSourceTag(uniqueId)}] ${user}: ${commentText}`);
  parseViewerComment(commentText, user, uniqueId, avatar);
}

function handleLikeEvent(data) {
  if (!interactionsAreEnabled()) return noteInteractionDroppedWhilePaused('like');
  const { user, uniqueId, avatar } = extractUserFromEvent(data);
  const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
  Rituals.strikeWoodenFish({ user, uniqueId, avatar, count: likeCount });
}

function handleSocialEvent(data) {
  if (!interactionsAreEnabled()) return noteInteractionDroppedWhilePaused('social');
  const { user, uniqueId, avatar } = extractUserFromEvent(data);
  Rituals.ringBell({
    user,
    uniqueId,
    avatar,
    count: 1,
    wish: 'Hữu duyên tương ngộ nơi cửa Phật, cầu bình an may mắn',
    readTts: false
  });
}

function handleGiftEvent(data) {
  if (!interactionsAreEnabled()) return noteInteractionDroppedWhilePaused('gift');
  const { user, uniqueId, avatar } = extractUserFromEvent(data);
  const giftObj = data?.gift || data?.giftDetails || {};
  const giftId = String(data?.giftId || giftObj?.id || 'rose');
  const groupId = String(data?.groupId || `${uniqueId}_${giftId}`);
  const repeatCount = toPositiveInt(data?.repeatCount ?? data?.comboCount, 1);
  const repeatEnd = Boolean(data?.repeatEnd);
  const now = Date.now();
  const isRose = isRoseGift(giftObj, giftId);
  const ctx = { user, uniqueId, avatar };

  const prevEntry = giftComboTracker.get(groupId);
  let deltaCount = 0;
  let entry;

  if (!prevEntry) {
    // Combo hoàn toàn mới (hoặc 1 quà đơn không nằm trong combo) -> ghi nhận từ đầu.
    deltaCount = repeatCount;
    entry = { maxCount: repeatCount, ended: repeatEnd, endedAt: repeatEnd ? now : null, lastSeen: now, isRose, thresholdDispatched: false, ctx };
    giftComboTracker.set(groupId, entry);
  } else if (!prevEntry.ended) {
    // Combo đang diễn ra (chưa kết thúc).
    if (repeatCount > prevEntry.maxCount) {
      deltaCount = repeatCount - prevEntry.maxCount;
      prevEntry.maxCount = repeatCount;
    }
    // repeatCount <= maxCount: sự kiện trùng lặp hoặc đến muộn giữa combo -> KHÔNG cộng thêm.
    if (repeatEnd) {
      prevEntry.ended = true;
      prevEntry.endedAt = now;
    }
    prevEntry.lastSeen = now;
    prevEntry.ctx = ctx; // tên/avatar có thể cập nhật mới hơn trong lúc combo diễn ra
    entry = prevEntry;
  } else if (now - prevEntry.endedAt <= GIFT_COMBO_FINALIZE_GRACE_MS) {
    // Combo vừa kết thúc gần đây -> đây là sự kiện trùng lặp/đến muộn của CHÍNH combo đó.
    if (repeatCount > prevEntry.maxCount) {
      // Hiếm gặp: 1 sự kiện đến muộn báo count cao hơn mốc đã chốt -> cộng bù phần chênh lệch
      // để không bỏ sót quà hợp lệ, rồi chốt lại mốc mới.
      deltaCount = repeatCount - prevEntry.maxCount;
      prevEntry.maxCount = repeatCount;
    }
    prevEntry.ended = true;
    prevEntry.endedAt = now;
    prevEntry.lastSeen = now;
    entry = prevEntry;
  } else {
    // Đã quá thời gian ân hạn kể từ lúc combo trước kết thúc -> xem như một combo MỚI của
    // cùng người xem (xảy ra khi TikTok không cung cấp groupId riêng cho mỗi combo).
    deltaCount = repeatCount;
    entry = { maxCount: repeatCount, ended: repeatEnd, endedAt: repeatEnd ? now : null, lastSeen: now, isRose, thresholdDispatched: false, ctx };
    giftComboTracker.set(groupId, entry);
  }

  if (giftComboTracker.size > 500) {
    const firstKey = giftComboTracker.keys().next().value;
    giftComboTracker.delete(firstKey);
  }

  // ---- HOA HỒNG (ROSE): đi theo luồng mốc 1/5/10 riêng, KHÔNG qua Rituals.offerGift ----
  // Chỉ quyết định nghi thức khi combo đã HOÀN TẤT (repeatEnd) — không kích hoạt "nghi thức
  // 1 Rose" giữa chừng khi combo đang tăng dần hướng tới mốc 5 hoặc 10 (yêu cầu rõ ràng).
  // thresholdDispatched đảm bảo 1 combo chỉ bao giờ kích hoạt ĐÚNG MỘT nghi thức, kể cả khi
  // sự kiện kết thúc (repeatEnd) bị TikTok gửi trùng lặp trong khoảng ân hạn ở trên.
  if (isRose) {
    // Cộng theo phần CHÊNH LỆCH mới quan sát được, không chờ repeatEnd. Nhờ vậy:
    // - donor lên VIP ngay khi Rose đầu tiên tới;
    // - event trùng/đến muộn với cùng count không cộng lại (deltaCount=0);
    // - correction hợp lệ sau khi combo đã chốt (count cao hơn) vẫn cộng đúng phần bù,
    //   dù thresholdDispatched ngăn không cho chạy nghi thức lần thứ hai.
    if (deltaCount > 0) {
      const donor = recordRoseDonation(entry.ctx, deltaCount);
      entry.ctx = {
        ...entry.ctx,
        user: donor.name,
        uniqueId: donor.uniqueId,
        avatar: donor.avatar
      };
      const source = eventSourceTag(entry.ctx.uniqueId);
      if (source === 'MOCK') roseFortuneStats.mockRosesReceived += deltaCount;
      else roseFortuneStats.realRosesReceived += deltaCount;
    }

    logLine(
      'INFO',
      'TikTok',
      `[GIFT][${eventSourceTag(uniqueId)}] ${user} gửi Rose (giftId=${giftId}) — tổng lượt/combo hiện tại: ${entry.maxCount}${entry.ended ? ', ĐÃ KẾT THÚC' : ', đang tiếp tục...'}`
    );
    if (entry.ended && !entry.thresholdDispatched) {
      entry.thresholdDispatched = true;
      dispatchRoseThreshold(entry.maxCount, entry.ctx);
    } else if (deltaCount > 0) {
      // Combo đang tiếp tục hoặc correction tới sau lần dispatch đầu: cập nhật ghế VIP
      // ngay, không chờ timer dọn combo.
      broadcastNotification('temple.state', getPublicState());
    }
    return;
  }

  // ---- QUÀ KHÁC ROSE: giữ nguyên hành vi cũ (ghi công đức theo diamondCount x đơn vị mới) ----
  if (deltaCount <= 0) return; // Không có đơn vị quà mới nào cần ghi công đức.

  const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
  const totalCoins = diamondCount * deltaCount;
  const rawGiftName = giftObj?.name || data?.giftName || giftObj?.describe || 'Hoa Hồng Tâm Thành';
  const displayGiftName = deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName;

  logLine('INFO', 'TikTok', `[GIFT][${eventSourceTag(uniqueId)}] ${user} gửi ${displayGiftName} (${totalCoins} xu)`);

  Rituals.offerGift({
    user,
    uniqueId,
    avatar,
    coins: totalCoins,
    giftName: displayGiftName,
    wish: `Thành tâm dâng ${displayGiftName} kính lễ Đức Phật A Di Đà`
  });
}

async function connectTikTokLive(usernameOrUrl, { isAutoRetry = false } = {}) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    // Đánh dấu "disconnect chủ ý" TRƯỚC khi dọn connection cũ — sự kiện 'disconnected' của
    // nó có thể bắn ra NGAY TRONG LÚC await (đồng bộ trước khi Promise disconnect() resolve,
    // vì listener dọn dẹp nội bộ của thư viện đăng ký SAU listener DISCONNECTED của ta), nên
    // nếu không chặn trước, listener cũ (đóng closure username CŨ) sẽ kịp gọi
    // scheduleTikTokReconnect() với tài khoản cũ trước khi dòng dưới kịp reset bộ đếm.
    tiktokIntentionalDisconnect = true;
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  // Mọi lệnh connect (thủ công từ Admin, auto-connect lúc boot, hoặc tự động retry) đều
  // thể hiện ý định "muốn được kết nối" -> hủy cờ "disconnect chủ ý", đồng thời mở một
  // "thế hệ" kết nối mới để các listener của kết nối CŨ (nếu còn sự kiện đang bay tới, ví
  // dụ 'disconnected' từ việc gọi disconnect() dọn dẹp ở trên) tự biết mình đã lỗi thời và
  // không ghi đè state hay lên lịch reconnect nhầm tài khoản.
  // LƯU Ý: bộ đếm tiktokReconnectAttempts CHỈ reset khi đây là ý định kết nối MỚI thật sự
  // (thủ công từ Admin / auto-connect lúc boot) — KHÔNG reset khi đây là chính lần tự động
  // retry do scheduleTikTokReconnect() gọi vào (isAutoRetry=true), nếu không bộ đếm sẽ luôn
  // về 0 trước khi kịp tăng, khiến giới hạn TIKTOK_MAX_AUTO_RECONNECTS không bao giờ có tác
  // dụng và backoff không bao giờ tăng — lỗi thực tế đã gặp khi vận hành thật.
  tiktokIntentionalDisconnect = false;
  clearTikTokReconnectTimer();
  if (!isAutoRetry) tiktokReconnectAttempts = 0;
  const myGeneration = ++tiktokConnGeneration;

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    // Chỉ tải "dữ liệu ban đầu" (vài bình luận/trạng thái phòng gần nhất) cho một kết nối
    // MỚI thật sự — nếu bật cho cả các lần TỰ ĐỘNG KẾT NỐI LẠI, mỗi lần retry (có thể lặp
    // lại nhiều lần liên tiếp khi dịch vụ ký TikTok đang gặp sự cố) sẽ tải lại và PHÁT LẠI
    // CÙNG một lô bình luận/sự kiện CŨ như thể là sự kiện MỚI, cộng trùng công đức cho
    // người xem nhiều lần — lỗi thực tế đã gặp (ReviewZone/Nammm/Châm Phạm bị cộng lặp lại
    // mỗi ~15-18s trong lúc tự động retry) trước khi vá.
    processInitialData: !isAutoRetry,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    if (myGeneration !== tiktokConnGeneration) return;
    tiktokReconnectAttempts = 0;
    clearTikTokReconnectTimer();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    logLine('INFO', 'TikTok', `Đã kết nối phòng @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    if (myGeneration !== tiktokConnGeneration) return;
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    logLine('WARN', 'TikTok', `Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
    if (!tiktokIntentionalDisconnect) scheduleTikTokReconnect(cleanUser);
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    if (myGeneration !== tiktokConnGeneration) return;
    // Thư viện tiktok-live-connector bắn sự kiện 'error' với payload dạng { info, exception }
    // (KHÔNG phải trực tiếp 1 Error), nên err?.message luôn undefined và String(err) cho ra
    // "[object Object]" vô nghĩa — lỗi thực tế đã thấy trong log vận hành trước khi vá. Lấy
    // đúng message từ err.exception (hoặc chính nó nếu đã là string) thay vì stringify cả object.
    const detail = err?.exception?.message || err?.exception || err?.message || err;
    state.tiktok.lastError = typeof detail === 'string' ? detail : JSON.stringify(detail);
    logLine('WARN', 'TikTok', `Lỗi kết nối${err?.info ? ` (${err.info})` : ''}: ${state.tiktok.lastError}`);
    broadcastNotification('temple.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  tiktokConn.on(WebcastEvent.MEMBER, handleMemberEvent);
  tiktokConn.on(WebcastEvent.CHAT, handleChatEvent);
  tiktokConn.on(WebcastEvent.LIKE, handleLikeEvent);
  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });
  tiktokConn.on(WebcastEvent.GIFT, handleGiftEvent);

  try {
    const roomState = await tiktokConn.connect();
    if (myGeneration !== tiktokConnGeneration) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    if (myGeneration !== tiktokConnGeneration) throw err;
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    logLine('ERROR', 'TikTok', `Kết nối @${cleanUser} thất bại: ${state.tiktok.lastError}`);
    broadcastNotification('temple.state', getPublicState());
    scheduleTikTokReconnect(cleanUser);
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  tiktokIntentionalDisconnect = true;
  clearTikTokReconnectTimer();
  tiktokReconnectAttempts = 0;
  tiktokConnGeneration += 1; // vô hiệu hóa listener của kết nối đang bị thay thế
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 5B. MOCK LIVE — GIẢ LẬP SỰ KIỆN TIKTOK ĐỂ KIỂM THỬ (KHÔNG KẾT NỐI MẠNG THẬT)
//     Dùng chung đúng các hàm xử lý (handleChatEvent/handleLikeEvent/
//     handleGiftEvent/handleSocialEvent/handleMemberEvent) với kết nối LIVE
//     thật ở trên, để test đúng pipeline (kể cả logic chống trùng combo gift).
//     Người dùng mock luôn có tiền tố "[MOCK]" + uniqueId "mock_*" để KHÔNG
//     bao giờ bị nhầm là tương tác thực từ người xem TikTok thật.
// ============================================================================
const MOCK_VIEWER_POOL = [
  { uniqueId: 'mock_an_nhien_88', nickname: 'An Nhiên' },
  { uniqueId: 'mock_minh_tam_vn', nickname: 'Minh Tâm' },
  { uniqueId: 'mock_dieu_huong', nickname: 'Diệu Hương' },
  { uniqueId: 'mock_thien_phuc', nickname: 'Thiện Phúc' },
  { uniqueId: 'mock_hoa_sen_vang', nickname: 'Hoa Sen Vàng' }
];
const MOCK_COMMENTS = [
  'con xin thắp hương cầu bình an',
  'nam mô a di đà phật, cầu gia đạo an lành',
  'cho con xin xăm đầu năm ạ',
  'thỉnh chuông cầu may mắn cho cả nhà',
  'gõ mõ tụng kinh hồi hướng công đức'
];
const MOCK_GIFTS = [
  { name: 'Hoa Hồng Tâm Thành', diamondCount: 1 },
  { name: 'Đèn Lưu Ly Trí Tuệ', diamondCount: 5 },
  { name: 'Mâm Ngũ Quả Cát Tường', diamondCount: 20 },
  { name: 'Đại Lễ Kim Long', diamondCount: 150 }
];

function pickMockViewer() {
  return MOCK_VIEWER_POOL[Math.floor(Math.random() * MOCK_VIEWER_POOL.length)];
}

function buildMockEventData(viewer, extra = {}) {
  // Lưu ý: tên hiển thị đi qua sanitizeUserName() — ký tự ngoặc vuông/tròn sẽ bị
  // bộ lọc chống spam coi là mã emote và xóa mất, nên dùng tiền tố "MOCK_" (gạch
  // dưới, nằm trong bảng ký tự cho phép) để nhãn mock luôn hiển thị nguyên vẹn.
  return {
    user: { nickname: `MOCK_${viewer.nickname}`, uniqueId: viewer.uniqueId, profilePictureUrl: '' },
    uniqueId: viewer.uniqueId,
    ...extra
  };
}

function mockLiveEvent(type, params = {}) {
  const viewer = MOCK_VIEWER_POOL.find((v) => v.uniqueId === params.uniqueId) || pickMockViewer();
  switch (type) {
    case 'member':
      handleMemberEvent(buildMockEventData(viewer));
      return { ok: true, type, viewer: viewer.uniqueId };
    case 'chat': {
      const content = params.comment || MOCK_COMMENTS[Math.floor(Math.random() * MOCK_COMMENTS.length)];
      handleChatEvent(buildMockEventData(viewer, { content }));
      return { ok: true, type, viewer: viewer.uniqueId, comment: content };
    }
    case 'like': {
      const count = params.count || 1 + Math.floor(Math.random() * 10);
      handleLikeEvent(buildMockEventData(viewer, { count }));
      return { ok: true, type, viewer: viewer.uniqueId, count };
    }
    case 'follow':
    case 'share':
      handleSocialEvent(buildMockEventData(viewer));
      return { ok: true, type, viewer: viewer.uniqueId };
    case 'gift': {
      const giftPick = MOCK_GIFTS[Math.floor(Math.random() * MOCK_GIFTS.length)];
      const groupId = params.groupId || `mockgroup_${viewer.uniqueId}`;
      const repeatCount = params.repeatCount || 1;
      // Cho phép truyền sẵn diamondCount (tùy chọn) để test tự động có thể kiểm chứng
      // chính xác số công đức cộng dồn qua nhiều bước của 1 combo — nếu không truyền,
      // giữ nguyên hành vi cũ (chọn ngẫu nhiên từ MOCK_GIFTS) cho các nút Mock trên Admin.
      const diamondCount = params.diamondCount != null ? Number(params.diamondCount) : giftPick.diamondCount;
      handleGiftEvent(buildMockEventData(viewer, {
        groupId,
        giftId: 'mock_gift',
        gift: { name: giftPick.name, diamondCount },
        repeatCount,
        repeatEnd: Boolean(params.repeatEnd)
      }));
      return { ok: true, type, viewer: viewer.uniqueId, groupId, repeatCount, diamondCount, repeatEnd: Boolean(params.repeatEnd) };
    }
    default:
      throw new Error(`Loại sự kiện Mock Live không hợp lệ: ${type} (hợp lệ: member, chat, like, follow, share, gift)`);
  }
}

let mockLiveTimer = null;
function configureMockLive(enabled) {
  state.settings.mockLiveEnabled = Boolean(enabled);
  if (mockLiveTimer) {
    clearInterval(mockLiveTimer);
    mockLiveTimer = null;
  }
  if (state.settings.mockLiveEnabled) {
    const EVENT_WEIGHTS = ['chat', 'chat', 'like', 'like', 'follow', 'gift', 'member'];
    mockLiveTimer = setInterval(() => {
      const type = EVENT_WEIGHTS[Math.floor(Math.random() * EVENT_WEIGHTS.length)];
      try {
        mockLiveEvent(type);
      } catch (e) {
        console.warn('[MockLive]', e.message);
      }
    }, 4000);
  }
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (CHẾ ĐỘ TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI XEM)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98', wish: 'Con thành tâm cầu cho bố mẹ luôn mạnh khỏe, bình an' },
  { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds', wish: 'Cầu tháng mới công việc thuận buồm xuôi gió, tài lộc hanh thông' },
  { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99', wish: 'Nam Mô A Di Đà Phật, nguyện cầu thế giới hòa bình chúng sinh an lạc' },
  { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev', wish: 'Cầu thi cử đỗ đạt điểm cao, sự nghiệp rộng mở' },
  { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus', wish: 'Cầu gia đạo êm ấm, con cái ngoan ngoãn học giỏi' },
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Con xin gieo một quẻ cầu tài lộc đầu năm' }
];
// Dùng bởi getLeaderboard() (định nghĩa phía trên) để ẩn các thí chủ do AutoSim tạo
// ra khỏi màn hình LIVE thật — xem isMockOrSimDevotee().
const SIM_DEVOTEE_UNIQUE_IDS = new Set(SIM_DEVOTEES.map((d) => d.uniqueId));

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const roll = Math.random();
  if (roll < 0.30) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.55) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.75) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.90) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 15, giftName: 'Hoa Sen Vàng Tinh Khiết' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.offerFlower':
      return Rituals.offerFlower(params);
    case 'temple.blessingRose':
      return Rituals.blessingRose(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'maichi');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    case 'live.mockEvent':
      return mockLiveEvent(params.type, params);
    case 'live.setMockMode':
      configureMockLive(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    case 'system.setInteractionsEnabled':
      state.settings.interactionsEnabled = Boolean(params.enabled);
      logLine('INFO', 'System', `Tương tác từ người xem ${state.settings.interactionsEnabled ? 'ĐƯỢC BẬT' : 'ĐÃ TẠM DỪNG'} qua dashboard Admin`);
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    case 'system.restartTts':
      logLine('INFO', 'System', 'Yêu cầu khởi động lại ZeroTTS worker thủ công từ dashboard Admin');
      return zeroTts.manualRestart();
    case 'system.getHealth':
      return getPublicState().health;
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// Bảo vệ dashboard Admin bằng ADMIN_TOKEN (tùy chọn qua biến môi trường). Nếu
// không đặt ADMIN_TOKEN, hành vi giữ nguyên như gốc (không yêu cầu đăng nhập) —
// chỉ bật khi người vận hành chủ động muốn khóa trang Admin trước khi mở ra
// ngoài localhost. Xem HUONG_DAN_VAN_HANH.md.
app.get('/admin', (req, res) => {
  if (ADMIN_TOKEN && req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send(
      '<meta charset="utf-8"><body style="background:#120504;color:#f4c150;font-family:sans-serif;padding:40px">' +
      '<h2>🔒 Cần token quản trị</h2>' +
      '<p>Server đang bật ADMIN_TOKEN. Truy cập bằng: <code>/admin?token=...</code></p></body>'
    );
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check đơn giản cho công cụ giám sát bên ngoài (uptime monitor, PM2, v.v.)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSec: Math.floor((Date.now() - BOOT_TIME) / 1000),
    tts: zeroTts ? zeroTts.status : 'init',
    tiktokConnected: state.tiktok.connected,
    wsClients: wss.clients.size
  });
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: thiếu method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// Heartbeat WebSocket (ping/pong mỗi 30s) — dọn các kết nối "chết" (ví dụ máy
// client mất mạng đột ngột không kịp gửi gói đóng kết nối) để không rò rỉ bộ nhớ
// khi chạy dài hạn 24/7.
function wsHeartbeatTick() {
  this.isAlive = true;
}
const wsHeartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', wsHeartbeatTick);

  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 CHÙA ONLINE TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Tự động kết nối tới @zenfacts_vn ngay khi khởi động server.
  // DISABLE_TIKTOK_AUTOCONNECT=1 chỉ dùng cho automated test (tránh gọi mạng TikTok thật
  // mỗi lần test khởi động server) — KHÔNG đặt biến này khi vận hành thật.
  const defaultChannel = process.env.DISABLE_TIKTOK_AUTOCONNECT === '1'
    ? null
    : (process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn');
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});

// ============================================================================
// 9. GRACEFUL SHUTDOWN (Ctrl+C / lệnh dừng dịch vụ) — lưu dữ liệu, đóng kết nối
//    gọn gàng trước khi thoát, không để mất dữ liệu Bảng Vàng Công Đức.
// ============================================================================
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logLine('INFO', 'System', `Nhận tín hiệu ${signal}, đang dừng dịch vụ an toàn...`);

  clearInterval(wsHeartbeatInterval);
  tiktokIntentionalDisconnect = true;
  clearTikTokReconnectTimer();
  clearRoseFortuneTimer();
  clearInterval(giftComboCleanupInterval);
  clearTimeout(saveTimer);

  if (zeroTts) {
    zeroTts.shuttingDown = true;
    if (zeroTts.restartTimer) {
      clearTimeout(zeroTts.restartTimer);
      zeroTts.restartTimer = null;
    }
    if (zeroTts.proc) {
      try { zeroTts.proc.kill(); } catch (_) {}
    }
  }
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
  }
  for (const ws of wss.clients) {
    try { ws.close(1001, 'server_shutdown'); } catch (_) {}
  }

  const toSave = {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    offerings: state.offerings,
    devotees: state.devotees,
    settings: state.settings
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    logLine('INFO', 'System', 'Đã lưu dữ liệu Bảng Vàng Công Đức trước khi thoát.');
  } catch (e) {
    logLine('ERROR', 'System', `Lỗi lưu dữ liệu lúc thoát: ${e.message}`);
  }

  server.close(() => {
    logLine('INFO', 'System', 'Đã dừng dịch vụ.');
    process.exit(0);
  });
  // Phòng khi server.close() treo quá lâu (kết nối còn mở) — vẫn thoát sau 5s.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
