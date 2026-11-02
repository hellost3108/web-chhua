'use strict';
/**
 * Phase 1 — Kiểm thử chống cộng trùng Gift Combo (handleGiftEvent / giftComboTracker).
 * Gửi sự kiện qua đúng RPC method công khai `live.mockEvent` (cùng pipeline với sự kiện
 * TikTok LIVE thật và với các nút Mock trên Admin) — không gọi hàm nội bộ trực tiếp.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/server');

const PORT = 3301;

test('Phase 1 - Gift combo idempotency', async (t) => {
  const server = startTestServer({ port: PORT, label: 'giftcombo' });
  await server.waitReady();
  t.after(() => server.stop());

  async function sendGift(params) {
    const before = await server.state();
    const beforeMerit = before.totalMerit;
    const beforeTopEventId = before.recentEvents[0] ? before.recentEvents[0].id : null;
    await server.rpc('live.mockEvent', { type: 'gift', ...params });
    const after = await server.state();
    const topId = after.recentEvents[0] ? after.recentEvents[0].id : null;
    const newEventPushed = topId !== beforeTopEventId;
    return {
      meritDelta: after.totalMerit - beforeMerit,
      newEventPushed,
      event: newEventPushed ? after.recentEvents[0] : null
    };
  }

  await t.test('Gift đơn (single, không combo) -> ghi nhận đúng 1 lần', async () => {
    const groupId = `single_${Date.now()}`;
    const r = await sendGift({ uniqueId: 'mock_an_nhien_88', groupId, repeatCount: 1, diamondCount: 10 });
    assert.equal(r.newEventPushed, true);
    assert.equal(r.meritDelta, 300); // coins=10*1=10 -> merit=max(20,10*30)=300
  });

  await t.test('Combo 1 -> 4 -> 10: tổng số đơn vị quy đổi đúng, không cộng trùng', async () => {
    const groupId = `combo_${Date.now()}`;
    const uniqueId = 'mock_an_nhien_88';

    const step1 = await sendGift({ uniqueId, groupId, repeatCount: 1, diamondCount: 10 });
    assert.equal(step1.newEventPushed, true);
    assert.equal(step1.meritDelta, 300); // delta=1, coins=10 -> merit=300

    const step2 = await sendGift({ uniqueId, groupId, repeatCount: 4, diamondCount: 10 });
    assert.equal(step2.newEventPushed, true);
    assert.equal(step2.meritDelta, 900); // delta=3, coins=30 -> merit=900

    const step3 = await sendGift({ uniqueId, groupId, repeatCount: 10, diamondCount: 10, repeatEnd: true });
    assert.equal(step3.newEventPushed, true);
    assert.equal(step3.meritDelta, 1800); // delta=6, coins=60 -> merit=1800
  });

  await t.test('Event trùng chưa kết thúc (giữa combo) -> không cộng thêm', async () => {
    const groupId = `dup_mid_${Date.now()}`;
    const uniqueId = 'mock_minh_tam_vn';

    const first = await sendGift({ uniqueId, groupId, repeatCount: 4, diamondCount: 10 });
    assert.equal(first.newEventPushed, true);

    const dup = await sendGift({ uniqueId, groupId, repeatCount: 4, diamondCount: 10 });
    assert.equal(dup.newEventPushed, false, 'sự kiện trùng repeatCount giữa combo không được tạo thêm merit');
    assert.equal(dup.meritDelta, 0);
  });

  await t.test('Event kết thúc (repeatEnd) bị gửi trùng -> chỉ tính 1 lần', async () => {
    const groupId = `dup_end_${Date.now()}`;
    const uniqueId = 'mock_minh_tam_vn';

    const body = await sendGift({ uniqueId, groupId, repeatCount: 5, diamondCount: 10 });
    assert.equal(body.newEventPushed, true);

    const end1 = await sendGift({ uniqueId, groupId, repeatCount: 5, diamondCount: 10, repeatEnd: true });
    assert.equal(end1.newEventPushed, false, 'repeatEnd ở đúng mốc đã ghi nhận không tạo thêm merit');

    const end2 = await sendGift({ uniqueId, groupId, repeatCount: 5, diamondCount: 10, repeatEnd: true });
    assert.equal(end2.newEventPushed, false, 'repeatEnd gửi trùng lần 2 không được tính thêm');
    assert.equal(end2.meritDelta, 0);
  });

  await t.test('Event cũ đến muộn (repeatCount thấp hơn mốc đã ghi) -> bị bỏ qua, không trừ lùi', async () => {
    const groupId = `late_${Date.now()}`;
    const uniqueId = 'mock_dieu_huong';

    await sendGift({ uniqueId, groupId, repeatCount: 8, diamondCount: 10 });
    const late = await sendGift({ uniqueId, groupId, repeatCount: 3, diamondCount: 10 });
    assert.equal(late.newEventPushed, false, 'event cũ đến muộn (repeatCount thấp hơn) không được ghi nhận');

    // Combo vẫn tiếp tục đúng sau khi bỏ qua event cũ đến muộn.
    const resume = await sendGift({ uniqueId, groupId, repeatCount: 12, diamondCount: 10, repeatEnd: true });
    assert.equal(resume.newEventPushed, true);
    assert.equal(resume.meritDelta, 1200); // delta = 12 - 8 = 4, coins=40 -> merit=max(20,40*30)=1200
  });

  await t.test('Event thiếu/sai repeatCount -> không NaN, mặc định xử lý như 1 đơn vị', async () => {
    const groupId = `badcount_${Date.now()}`;
    const r = await sendGift({ uniqueId: 'mock_thien_phuc', groupId, repeatCount: 'not-a-number', diamondCount: 10 });
    assert.equal(r.newEventPushed, true);
    assert.equal(Number.isNaN(r.meritDelta), false);
    assert.equal(r.meritDelta, 300); // xử lý như repeatCount=1 -> delta=1, coins=10 -> merit=300
  });

  await t.test('Hai người tặng quà cùng lúc -> không lẫn dữ liệu của nhau', async () => {
    const ts = Date.now();
    const [rA, rB] = await Promise.all([
      sendGift({ uniqueId: 'mock_an_nhien_88', groupId: `concurA_${ts}`, repeatCount: 1, diamondCount: 10 }),
      sendGift({ uniqueId: 'mock_minh_tam_vn', groupId: `concurB_${ts}`, repeatCount: 1, diamondCount: 20 })
    ]);
    assert.equal(rA.newEventPushed, true);
    assert.equal(rB.newEventPushed, true);
    // Hai request chạy đồng thời nên ta không khẳng định rạch ròi thứ tự merit tuyệt đối
    // trong state cuối (vì đọc state sau mỗi lần có thể xen giữa 2 request) — nhưng tối
    // thiểu cả 2 event phải thực sự được ghi (not lost), và không có NaN nào xuất hiện.
    assert.equal(Number.isNaN(rA.meritDelta) || Number.isNaN(rB.meritDelta), false);
  });

  await t.test('Hai combo hợp lệ liên tiếp từ cùng người xem (groupId thật khác nhau) -> tính đủ cả 2', async () => {
    const uniqueId = 'mock_hoa_sen_vang';
    const ts = Date.now();

    const comboA = await sendGift({ uniqueId, groupId: `realA_${ts}`, repeatCount: 5, diamondCount: 10, repeatEnd: true });
    assert.equal(comboA.newEventPushed, true);
    assert.equal(comboA.meritDelta, 1500); // delta=5, coins=50 -> merit=max(20,50*30)=1500

    const comboB = await sendGift({ uniqueId, groupId: `realB_${ts}`, repeatCount: 3, diamondCount: 10, repeatEnd: true });
    assert.equal(comboB.newEventPushed, true);
    assert.equal(comboB.meritDelta, 900); // delta=3, coins=30 -> merit=900
  });

  await t.test('Thiếu groupId thật (dùng key dự phòng): sau thời gian ân hạn, combo mới vẫn được tính đủ', async () => {
    const uniqueId = 'mock_an_nhien_88';
    const sharedGroupId = `fallback_shared_${Date.now()}`; // mô phỏng key dự phòng uniqueId+giftId khi TikTok không gửi groupId

    const comboA = await sendGift({ uniqueId, groupId: sharedGroupId, repeatCount: 3, diamondCount: 10, repeatEnd: true });
    assert.equal(comboA.newEventPushed, true);
    assert.equal(comboA.meritDelta, 900);

    // Chờ quá thời gian ân hạn (GIFT_COMBO_FINALIZE_GRACE_MS = 3000ms) rồi gửi 1 combo MỚI
    // tái dùng đúng groupId dự phòng đó — phải được tính như 1 combo mới, không bị chặn.
    await new Promise((r) => setTimeout(r, 3300));

    const comboB = await sendGift({ uniqueId, groupId: sharedGroupId, repeatCount: 2, diamondCount: 10, repeatEnd: true });
    assert.equal(comboB.newEventPushed, true, 'combo mới sau grace window không được bị chặn nhầm thành trùng');
    assert.equal(comboB.meritDelta, 600); // delta=2 (combo mới từ 0), coins=20 -> merit=max(20,20*30)=600
  });

  await t.test('Stress test: 100 gift events độc lập đồng thời -> không mất, không trùng', async () => {
    const before = await server.state();
    const N = 100;
    const diamondCount = 5; // coins=5 -> merit=max(20,5*20)=100 mỗi event (giftType lamp, multiplier 20)
    const jobs = [];
    for (let i = 0; i < N; i++) {
      jobs.push(server.rpc('live.mockEvent', {
        type: 'gift',
        uniqueId: 'mock_thien_phuc',
        groupId: `stress_${i}_${before ? 1 : 1}_${Math.random()}`,
        repeatCount: 1,
        diamondCount
      }));
    }
    await Promise.all(jobs);
    const after = await server.state();
    assert.equal(after.totalMerit - before.totalMerit, N * 100);

    const health = await server.health();
    assert.equal(health.status, 'ok', 'server phải vẫn phản hồi bình thường sau stress test');
  });
});
