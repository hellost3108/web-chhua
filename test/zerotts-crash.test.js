'use strict';
/**
 * Phase 3 — Kiểm thử ZeroTTSManager không được làm crash Node.js khi Python worker
 * gặp lỗi (không tìm thấy Python, sai đường dẫn, worker crash khi khởi động, v.v.)
 *
 * Dùng ZEROTTS_PYTHON_BIN để ép ZeroTTSManager spawn một binary lỗi/không tồn tại,
 * mà không cần tải model ZeroTTS thật (nặng, chậm, không cần thiết để test khả năng
 * chịu lỗi của lớp quản lý tiến trình).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startTestServer } = require('./helpers/server');

test('Phase 3 - ZeroTTS: Python không tồn tại / sai đường dẫn -> server KHÔNG crash', async (t) => {
  const badPythonPath = path.join(__dirname, 'this-python-does-not-exist-xyz.exe');
  const server = startTestServer({
    port: 3303,
    label: 'ttsbad',
    env: { ZEROTTS_DISABLE: '0', ZEROTTS_PYTHON_BIN: badPythonPath }
  });
  await server.waitReady();
  t.after(() => server.stop());

  // Ngay sau lỗi ENOENT đầu tiên, server vẫn phải sống và phản hồi HTTP bình thường.
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(server.exited, false, 'Node.js process không được thoát khi spawn Python thất bại (ENOENT)');
  const health1 = await server.health();
  assert.equal(health1.status, 'ok');

  const st1 = await server.state();
  assert.ok(['loading', 'restarting', 'error'].includes(st1.tts.status), `trạng thái TTS phải phản ánh đang gặp lỗi, nhận được: ${st1.tts.status}`);

  await t.test('Nhiều request TTS đồng thời khi worker đang lỗi -> trả lỗi gọn gàng, không treo', async () => {
    const results = await Promise.all([
      server.rpc('temple.speak', { text: 'Nam mô A Di Đà Phật một' }),
      server.rpc('temple.speak', { text: 'Nam mô A Di Đà Phật hai' }),
      server.rpc('temple.speak', { text: 'Nam mô A Di Đà Phật ba' })
    ]);
    for (const r of results) {
      assert.ok(r.result, 'phải có kết quả JSON-RPC hợp lệ, không bị treo/timeout');
      assert.equal(r.result.ok, false);
    }
    assert.equal(server.exited, false);
  });

  await t.test('Retry tự động đạt giới hạn (3 lần) rồi dừng -> KHÔNG lặp vô hạn', async () => {
    // Backoff: 5s, 10s, 15s giữa các lần tự thử lại -> chờ đủ để đạt trạng thái 'error' cuối cùng.
    const deadline = Date.now() + 40000;
    let last = null;
    while (Date.now() < deadline) {
      const st = await server.state();
      last = st.tts;
      if (st.tts.status === 'error') break;
      assert.equal(server.exited, false, 'server không được crash trong lúc tự retry');
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(last.status, 'error', `phải dừng ở trạng thái 'error' sau khi hết lượt retry, nhận được: ${JSON.stringify(last)}`);
    assert.equal(last.restartAttempts, 3);
    assert.equal(server.exited, false);
  });

  await t.test('Nút "Khởi động lại ZeroTTS" (system.restartTts) hoạt động sau khi đã hết lượt retry', async () => {
    const res = await server.rpc('system.restartTts', {});
    assert.ok(res.result);
    assert.equal(res.result.restartAttempts, 0, 'manualRestart phải reset bộ đếm retry');

    // Phải thấy nỗ lực khởi động lại ngay (không phải đợi thêm 5-15s theo backoff cũ).
    await new Promise((r) => setTimeout(r, 400));
    const st = await server.state();
    assert.ok(['loading', 'restarting'].includes(st.tts.status), `phải đang thử khởi động lại ngay, nhận được: ${st.tts.status}`);
    assert.equal(server.exited, false);
  });
});

test('Phase 3 - ZeroTTS: worker crash ngay khi khởi động (spawn OK nhưng exit code != 0) -> server KHÔNG crash', async (t) => {
  // Dùng chính node.exe làm "python" giả: node sẽ cố parse tts_worker.py như JS, lỗi cú
  // pháp ngay, tiến trình con thoát gần như lập tức với exit code != 0 (khác hẳn đường
  // ENOENT ở test trên — đây đi qua event 'exit', không phải 'error').
  const server = startTestServer({
    port: 3304,
    label: 'ttscrash',
    env: { ZEROTTS_DISABLE: '0', ZEROTTS_PYTHON_BIN: process.execPath }
  });
  await server.waitReady();
  t.after(() => server.stop());

  await new Promise((r) => setTimeout(r, 800));
  assert.equal(server.exited, false, 'Node.js process không được thoát khi worker con crash ngay sau khi spawn');
  const health = await server.health();
  assert.equal(health.status, 'ok');

  const st = await server.state();
  assert.ok(['loading', 'restarting', 'error'].includes(st.tts.status));
});
