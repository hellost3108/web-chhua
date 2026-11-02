'use strict';
/**
 * Test harness: khởi chạy server.js thật (không mock lại logic) như một tiến trình
 * con riêng biệt, với dữ liệu (DATA_DIR/LOG_DIR) cô lập hoàn toàn trong test/tmp/ —
 * KHÔNG BAO GIỜ đụng tới data/merit-state.json hay logs/ thật của người dùng.
 *
 * - DISABLE_TIKTOK_AUTOCONNECT=1 luôn được đặt: test không kết nối TikTok LIVE thật.
 * - ZEROTTS_DISABLE=1 theo mặc định: bỏ qua việc tải model ZeroTTS (nặng, chậm) cho
 *   các test không liên quan tới TTS. Set env.ZEROTTS_DISABLE='0' hoặc truyền
 *   ZEROTTS_PYTHON_BIN để kiểm thử riêng khả năng chịu lỗi của ZeroTTSManager.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function freshTmpDir(prefix) {
  const dir = path.join(
    PROJECT_ROOT,
    'test',
    'tmp',
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function waitForHealth(port, timeoutMs, isAlive) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    if (isAlive && !isAlive()) {
      throw new Error('Tiến trình server đã thoát trước khi sẵn sàng (xem getStderr()/getStdout() để biết lý do)');
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server không sẵn sàng sau ${timeoutMs}ms trên cổng ${port}: ${lastErr ? lastErr.message : ''}`);
}

function startTestServer({ port, label = 'srv', env = {} }) {
  const dataDir = freshTmpDir(`${label}-data`);
  const logDir = freshTmpDir(`${label}-logs`);

  const child = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, 'server.js')],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        LOG_DIR: logDir,
        DISABLE_TIKTOK_AUTOCONNECT: '1',
        ZEROTTS_DISABLE: '1',
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (c) => stdoutChunks.push(c.toString('utf8')));
  child.stderr.on('data', (c) => stderrChunks.push(c.toString('utf8')));

  let exited = false;
  let exitInfo = null;
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  const handle = {
    child,
    port,
    dataDir,
    logDir,
    get exited() {
      return exited;
    },
    get exitInfo() {
      return exitInfo;
    },
    getStdout: () => stdoutChunks.join(''),
    getStderr: () => stderrChunks.join(''),
    async waitReady(timeoutMs = 15000) {
      await waitForHealth(port, timeoutMs, () => !exited);
      return handle;
    },
    async rpc(method, params = {}) {
      const res = await fetch(`http://127.0.0.1:${port}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() + Math.random(), method, params })
      });
      return res.json();
    },
    async state() {
      const res = await fetch(`http://127.0.0.1:${port}/api/state`);
      return res.json();
    },
    async health() {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      return res.json();
    },
    readStateFile() {
      const file = path.join(dataDir, 'merit-state.json');
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
    async stop() {
      if (!exited) {
        child.kill();
        const deadline = Date.now() + 5000;
        while (!exited && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!exited) {
          try { child.kill('SIGKILL'); } catch (_) {}
        }
      }
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
      try { fs.rmSync(logDir, { recursive: true, force: true }); } catch (_) {}
    }
  };
  return handle;
}

module.exports = { startTestServer };
