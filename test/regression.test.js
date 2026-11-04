'use strict';
/**
 * Phase 6 — Regression test cho các RPC method quan trọng (phải giữ nguyên tương thích),
 * đảm bảo không có RPC nào bị vỡ sau khi sửa 3 lỗi + tối ưu hiệu năng.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/server');

const PORT = 3305;

test('Phase 6 - RPC method regression smoke test', async (t) => {
  const server = startTestServer({ port: PORT, label: 'regress' });
  await server.waitReady();
  t.after(() => server.stop());

  await t.test('temple.getState trả về đầy đủ cấu trúc state công khai', async () => {
    const res = await server.rpc('temple.getState', {});
    assert.ok(res.result);
    assert.ok('totalIncense' in res.result);
    assert.ok('totalMerit' in res.result);
    assert.ok('leaderboard' in res.result);
    assert.ok('settings' in res.result);
    assert.ok('tts' in res.result);
    assert.ok('health' in res.result);
  });

  await t.test('temple.burnIncense cộng đúng công đức', async () => {
    const before = await server.state();
    const res = await server.rpc('temple.burnIncense', { user: 'Test User', count: 3, wish: 'binh an' });
    assert.equal(res.result.event.type, 'burnIncense');
    assert.equal(res.result.event.merit, 15); // count*5
    const after = await server.state();
    assert.equal(after.totalMerit - before.totalMerit, 15);
  });

  await t.test('temple.strikeWoodenFish cộng đúng công đức', async () => {
    const res = await server.rpc('temple.strikeWoodenFish', { user: 'Test User', count: 5 });
    assert.equal(res.result.event.merit, 5);
  });

  await t.test('temple.ringBell cộng đúng công đức', async () => {
    const res = await server.rpc('temple.ringBell', { user: 'Test User', count: 2, wish: 'an lanh', readTts: true });
    assert.equal(res.result.event.merit, 20); // count*10
  });

  await t.test('temple.sendPrayer cộng đúng công đức', async () => {
    const res = await server.rpc('temple.sendPrayer', { user: 'Test User', wish: 'cau binh an' });
    assert.equal(res.result.event.merit, 10);
  });

  await t.test('temple.offerGift phân loại giftType đúng theo coins', async () => {
    const r1 = await server.rpc('temple.offerGift', { user: 'A', coins: 3 });
    assert.equal(r1.result.event.giftType, 'lotus');
    const r2 = await server.rpc('temple.offerGift', { user: 'A', coins: 150 });
    assert.equal(r2.result.event.giftType, 'dragon');
  });

  await t.test('temple.drawFortune trả về 1 trong 10 quẻ hợp lệ', async () => {
    const res = await server.rpc('temple.drawFortune', { user: 'A', topic: 'tai loc' });
    assert.ok(res.result.event.fortune.number);
    assert.ok(res.result.event.fortune.rank);
  });

  await t.test('temple.grandCeremony luôn ghi nhận là giftType dragon', async () => {
    const res = await server.rpc('temple.grandCeremony', { user: 'A', coins: 50 });
    assert.equal(res.result.event.giftType, 'dragon'); // ép tối thiểu 100 coin bên trong
  });

  await t.test('temple.updateSettings cập nhật & phát lại đúng settings', async () => {
    const res = await server.rpc('temple.updateSettings', { ttsEnabled: false, smokeDensity: 0.5 });
    assert.equal(res.result.settings.ttsEnabled, false);
    assert.equal(res.result.settings.smokeDensity, 0.5);
  });

  await t.test('temple.comment CHỈ đưa người xem vào chùa, không tự kích hoạt nghi thức dù trùng từ khóa', async () => {
    // Mỗi lệnh dùng uniqueId riêng để không bị chặn bởi cooldown chống spam bình luận
    // (3.5s/người) — đây là test hành vi bình luận, không phải test cooldown.
    const r1 = await server.rpc('temple.comment', { comment: 'con xin xem que dau nam', user: 'A', uniqueId: 'cmt_test_1' });
    assert.equal(r1.result.event.type, 'viewerComment');
    assert.equal(r1.result.event.merit, 0, 'bình luận không được tạo công đức');
    const r2 = await server.rpc('temple.comment', { comment: 'thinh chuong cau may', user: 'A', uniqueId: 'cmt_test_2' });
    assert.equal(r2.result.event.type, 'viewerComment');
    const r3 = await server.rpc('temple.comment', { comment: 'go mo tung kinh dang huong', user: 'A', uniqueId: 'cmt_test_3' });
    assert.equal(r3.result.event.type, 'viewerComment');
    assert.equal(r3.result.event.comment, 'go mo tung kinh dang huong');
  });

  await t.test('temple.comment lọc được spam/toxic (không ném lỗi, trả null)', async () => {
    const res = await server.rpc('temple.comment', { comment: 'đm lừa đảo', user: 'Spammer' });
    assert.equal(res.result, null);
  });

  await t.test('temple.ttsStatus trả về object trạng thái hợp lệ khi TTS disabled', async () => {
    const res = await server.rpc('temple.ttsStatus', {});
    assert.equal(res.result.ready, false);
  });

  await t.test('live.connect với username rỗng -> lỗi rõ ràng, KHÔNG gọi mạng', async () => {
    const res = await server.rpc('live.connect', { username: '' });
    assert.ok(res.error);
  });

  await t.test('live.setAutoSim bật/tắt đúng & lưu vào settings', async () => {
    const r1 = await server.rpc('live.setAutoSim', { enabled: true });
    assert.equal(r1.result.settings.autoSim, true);
    const r2 = await server.rpc('live.setAutoSim', { enabled: false });
    assert.equal(r2.result.settings.autoSim, false);
  });

  await t.test('live.setMockMode bật/tắt đúng', async () => {
    const r1 = await server.rpc('live.setMockMode', { enabled: true });
    assert.equal(r1.result.settings.mockLiveEnabled, true);
    const r2 = await server.rpc('live.setMockMode', { enabled: false });
    assert.equal(r2.result.settings.mockLiveEnabled, false);
  });

  await t.test('live.mockEvent hỗ trợ đủ 6 loại sự kiện không lỗi', async () => {
    for (const type of ['member', 'chat', 'like', 'follow', 'share', 'gift']) {
      const res = await server.rpc('live.mockEvent', { type });
      assert.ok(res.result, `loại ${type} phải chạy không lỗi`);
      assert.equal(res.result.ok, true);
    }
  });

  await t.test('live.mockEvent với loại không hợp lệ -> trả lỗi JSON-RPC, không crash', async () => {
    const res = await server.rpc('live.mockEvent', { type: 'khong_ton_tai' });
    assert.ok(res.error);
    const health = await server.health();
    assert.equal(health.status, 'ok');
  });

  await t.test('system.setInteractionsEnabled tạm dừng tương tác người xem đúng cách', async () => {
    await server.rpc('system.setInteractionsEnabled', { enabled: false });
    const before = await server.state();
    await server.rpc('live.mockEvent', { type: 'gift', uniqueId: 'mock_an_nhien_88', groupId: `paused_${Date.now()}`, repeatCount: 1, diamondCount: 50 });
    const after = await server.state();
    assert.equal(after.totalMerit, before.totalMerit, 'khi tạm dừng, sự kiện mock/tiktok không được cộng công đức');

    await server.rpc('system.setInteractionsEnabled', { enabled: true });
    const res2 = await server.rpc('live.mockEvent', { type: 'gift', uniqueId: 'mock_an_nhien_88', groupId: `resumed_${Date.now()}`, repeatCount: 1, diamondCount: 50 });
    assert.equal(res2.result.ok, true);
    const after2 = await server.state();
    assert.ok(after2.totalMerit > after.totalMerit, 'sau khi bật lại, sự kiện phải được ghi nhận bình thường');
  });

  // Dù đang tạm dừng tương tác người xem, RPC thao tác thủ công từ Admin vẫn phải hoạt động.
  await t.test('RPC thủ công từ Admin vẫn hoạt động dù interactionsEnabled=false', async () => {
    await server.rpc('system.setInteractionsEnabled', { enabled: false });
    const res = await server.rpc('temple.burnIncense', { user: 'Admin Manual', count: 1 });
    assert.equal(res.result.event.type, 'burnIncense');
    await server.rpc('system.setInteractionsEnabled', { enabled: true });
  });

  await t.test('system.getHealth trả về thông tin vận hành hợp lệ', async () => {
    const res = await server.rpc('system.getHealth', {});
    assert.ok(typeof res.result.uptimeSec === 'number');
    assert.ok(typeof res.result.wsClients === 'number');
  });

  await t.test('temple.resetMerit đặt lại đúng giá trị mặc định', async () => {
    const res = await server.rpc('temple.resetMerit', {});
    assert.equal(res.result.totalMerit, 0);
    assert.equal(res.result.leaderboard.length, 0);
  });

  await t.test('RPC method không tồn tại -> lỗi JSON-RPC rõ ràng, không crash server', async () => {
    const res = await server.rpc('khong.ton.tai', {});
    assert.ok(res.error);
    assert.equal(server.exited, false);
    const health = await server.health();
    assert.equal(health.status, 'ok');
  });

  await t.test('Nhiều loại tương tác đồng thời (đông người xem) không gây lỗi/mất dữ liệu', async () => {
    const before = await server.state();
    const jobs = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(server.rpc('temple.burnIncense', { user: `Viewer${i}`, count: 1 }));
      jobs.push(server.rpc('temple.strikeWoodenFish', { user: `Viewer${i}`, count: 1 }));
      jobs.push(server.rpc('temple.sendPrayer', { user: `Viewer${i}`, wish: 'binh an' }));
    }
    const results = await Promise.all(jobs);
    assert.ok(results.every((r) => r.result && !r.error));
    const after = await server.state();
    // 20 * (5 + 1 + 10) = 320
    assert.equal(after.totalMerit - before.totalMerit, 320);
    assert.equal(server.exited, false);
  });
});

test('Phase 6 - WebSocket: kết nối, nhận state ban đầu, RPC qua WS, và reconnect', async (t) => {
  const WebSocket = require('ws');
  const server = startTestServer({ port: 3306, label: 'wstest' });
  await server.waitReady();
  t.after(() => server.stop());

  await t.test('Kết nối WS nhận ngay temple.state ban đầu', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const firstMsg = await new Promise((resolve, reject) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString('utf8'))));
      ws.on('error', reject);
    });
    assert.equal(firstMsg.method, 'temple.state');
    assert.ok(firstMsg.params.settings);
    ws.close();
  });

  await t.test('Gửi RPC qua WS nhận đúng kết quả theo id', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));
    await new Promise((resolve) => ws.once('message', resolve)); // bỏ qua temple.state ban đầu

    // RPC này cũng kích hoạt broadcastNotification('temple.event', ...) gửi tới CHÍNH client
    // này (không có field id) TRƯỚC KHI phản hồi trực tiếp có id được gửi — nên phải lọc
    // đúng message có id khớp, không giả định message tiếp theo luôn là phản hồi RPC.
    const reply = await new Promise((resolve, reject) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.id === 999) resolve(msg);
      });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'temple.strikeWoodenFish', params: { user: 'WSUser', count: 1 } }));
      ws.on('error', reject);
    });
    assert.equal(reply.id, 999);
    assert.equal(reply.result.event.type, 'strikeWoodenFish');
    ws.close();
  });

  await t.test('Đóng và mở lại WS -> nhận lại đúng temple.state hiện tại (reconnect tự đồng bộ)', async () => {
    await server.rpc('live.setAutoSim', { enabled: true });

    const ws1 = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws1.once('message', resolve));
    ws1.close();
    await new Promise((r) => setTimeout(r, 200));

    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const msg = await new Promise((resolve, reject) => {
      ws2.on('message', (data) => resolve(JSON.parse(data.toString('utf8'))));
      ws2.on('error', reject);
    });
    assert.equal(msg.method, 'temple.state');
    assert.equal(msg.params.settings.autoSim, true, 'kết nối WS mới phải thấy đúng trạng thái autoSim hiện tại của server');
    ws2.close();

    await server.rpc('live.setAutoSim', { enabled: false });
  });
});

test('Phase 6 - Lưu và khôi phục dữ liệu (persistence)', async (t) => {
  const server1 = startTestServer({ port: 3307, label: 'persist' });
  await server1.waitReady();

  await server1.rpc('temple.burnIncense', { user: 'Persist User', count: 3, wish: 'test' });
  await server1.rpc('temple.ringBell', { user: 'Persist User', count: 1 });
  await server1.rpc('live.setAutoSim', { enabled: true });

  // saveState() có debounce 1200ms trước khi ghi file -> chờ đủ lâu rồi mới đọc trực tiếp.
  await new Promise((r) => setTimeout(r, 1600));

  const onDisk = server1.readStateFile();
  assert.ok(onDisk, 'file merit-state.json phải được tạo ra');
  assert.equal(onDisk.settings.autoSim, true);
  assert.ok(onDisk.totalMerit >= 25); // 3*5 + 10

  const dataDir = server1.dataDir;
  const expectedMerit = onDisk.totalMerit;
  await server1.stop(); // stop() ở đây sẽ dọn dataDir của server1 -> cần copy trước khi dọn

  // Vì stop() dọn dataDir, ta khôi phục lại dữ liệu đã đọc vào 1 dataDir mới cho server2
  // để kiểm tra đúng hành vi "khởi động lại đọc đúng file đã lưu" mà không phụ thuộc thứ
  // tự dọn dẹp của harness.
  const fs = require('fs');
  const path = require('path');
  const restoreDir = path.join(__dirname, 'tmp', `restore-${Date.now()}`);
  fs.mkdirSync(restoreDir, { recursive: true });
  fs.writeFileSync(path.join(restoreDir, 'merit-state.json'), JSON.stringify(onDisk, null, 2), 'utf8');

  t.after(() => fs.rmSync(restoreDir, { recursive: true, force: true }));

  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: '3308',
      DATA_DIR: restoreDir,
      LOG_DIR: restoreDir,
      DISABLE_TIKTOK_AUTOCONNECT: '1',
      ZEROTTS_DISABLE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const deadline = Date.now() + 10000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:3308/health');
      if (res.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ready, 'server2 phải khởi động thành công');

  const stateRes = await fetch('http://127.0.0.1:3308/api/state');
  const restoredState = await stateRes.json();
  assert.equal(restoredState.totalMerit, expectedMerit, 'phải khôi phục đúng công đức đã lưu từ lần chạy trước');
  assert.equal(restoredState.settings.autoSim, true, 'phải khôi phục đúng cài đặt AutoSim đã lưu');

  child.kill();
});
