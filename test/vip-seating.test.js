'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/server');

const PORT = 3310;

test('Rose donors are separated into the VIP seating tier', async (t) => {
  const server = startTestServer({
    port: PORT,
    label: 'vip-seating',
    env: { ROSE_FORTUNE_INTERVAL_MS: '15' }
  });
  await server.waitReady();
  t.after(() => server.stop());

  await server.rpc('live.setMockMode', { enabled: true });

  async function sendRose(uniqueId, repeatCount, groupId) {
    const res = await server.rpc('live.mockEvent', {
      type: 'gift',
      uniqueId,
      groupId,
      diamondCount: 1,
      repeatCount,
      repeatEnd: true
    });
    assert.ok(res.result?.ok, `Rose event for ${uniqueId} must succeed`);
  }

  await t.test('high merit without Rose stays regular; 1 Rose moves donor to VIP', async () => {
    await server.rpc('temple.offerGift', {
      user: 'Nhieu Cong Duc',
      uniqueId: 'regular_high_merit',
      coins: 250,
      giftName: 'Le Vat Thuong',
      readTts: false
    });
    await sendRose('mock_an_nhien_88', 1, `rose_one_${Date.now()}`);

    const state = await server.state();
    assert.ok(state.seating);
    assert.equal(state.seating.vip[0].uniqueId, 'mock_an_nhien_88');
    assert.equal(state.seating.vip[0].roseCount, 1);
    assert.ok(state.seating.regular.some((d) => d.uniqueId === 'regular_high_merit'));
    assert.ok(!state.seating.vip.some((d) => d.uniqueId === 'regular_high_merit'));
  });

  await t.test('equal Rose totals prefer the most recent donor', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sendRose('mock_minh_tam_vn', 1, `rose_recent_${Date.now()}`);

    const state = await server.state();
    assert.equal(state.seating.vip[0].uniqueId, 'mock_minh_tam_vn');
    assert.equal(state.seating.vip[1].uniqueId, 'mock_an_nhien_88');
  });

  await t.test('combo totals accumulate once and duplicate repeatEnd is idempotent', async () => {
    const groupId = `rose_combo_${Date.now()}`;
    await sendRose('mock_an_nhien_88', 5, groupId);
    await sendRose('mock_an_nhien_88', 5, groupId);

    const state = await server.state();
    const donor = state.seating.vip.find((d) => d.uniqueId === 'mock_an_nhien_88');
    assert.equal(donor.roseCount, 6, '1 Rose before + one 5-Rose combo; duplicate end must not add again');
  });

  await t.test('late higher repeatCount credits only the missing Rose delta', async () => {
    const groupId = `rose_late_correction_${Date.now()}`;
    await sendRose('mock_hoa_sen_vang', 1, groupId);
    await sendRose('mock_hoa_sen_vang', 5, groupId);

    const state = await server.state();
    const donor = state.seating.vip.find((d) => d.uniqueId === 'mock_hoa_sen_vang');
    assert.equal(donor.roseCount, 5, 'late correction 1 -> 5 must add only the missing 4 Roses');
  });

  await t.test('non-threshold Rose combo is still counted for VIP seating', async () => {
    await sendRose('mock_dieu_huong', 2, `rose_fallback_${Date.now()}`);
    const state = await server.state();
    const donor = state.seating.vip.find((d) => d.uniqueId === 'mock_dieu_huong');
    assert.equal(donor.roseCount, 2);
  });

  await t.test('disabling automatic Rose rituals does not hide a real donor', async () => {
    await server.rpc('temple.updateSettings', { autoFortuneOnRoseEnabled: false });
    await sendRose('mock_thien_phuc', 1, `rose_disabled_${Date.now()}`);

    const state = await server.state();
    const donor = state.seating.vip.find((d) => d.uniqueId === 'mock_thien_phuc');
    assert.ok(donor);
    assert.equal(donor.roseCount, 1);
  });

  await t.test('a person is never rendered in both VIP and regular arrays', async () => {
    const state = await server.state();
    const vipIds = new Set(state.seating.vip.map((d) => d.uniqueId));
    assert.ok(state.seating.vip.length <= state.seating.vipCapacity);
    assert.ok(state.seating.regular.every((d) => !vipIds.has(d.uniqueId)));
  });
});
