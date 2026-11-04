/**
 * Live 9:16 Client Controller — Chánh Điện Đức Phật A Di Đà & Đạo Tràng Phật Tử Quỳ Lễ
 * - Hiển thị 6 Đệm Quỳ VIP (Top 6 Bảng Vàng Công Đức)
 * - Hiển thị 40 Phật Tử mặc áo lam quỳ hai bên thảm đỏ + thẻ tên người xem
 * - Hiệu ứng người xem bước dọc thảm đỏ lên trước Lư Hương Đồng dâng hương
 * - Giọng đọc ZeroTTS (Mai Chi) + Pháp khí Web Audio
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. Tự động co giãn khung 1080x1920 vừa khít Stage Wrapper (9:16)
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');

  function fitStage() {
    if (!stageWrapper || !stage9x16) return;
    const rect = stageWrapper.getBoundingClientRect();
    const scale = rect.width / 1080;
    stage9x16.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // 2. Khởi tạo Particle Engine & Audio Engine (ZeroTTS Mai Chi)
  const canvas = document.getElementById('templeCanvas');
  const particles = new window.TempleParticleEngine(canvas);
  const audio = new window.TempleAudioEngine();

  function unlockAudioOnce() {
    audio.ensureContext();
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '✅ Âm Thanh Chùa Đã Sẵn Sàng';
      btnUnlock.classList.remove('gold');
      btnUnlock.classList.add('active-toggle');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // 3. Vẽ các nén nhang đang cháy trong Lư Hương Đỉnh Đồng (x=540, y=895)
  const incenseHolder = document.getElementById('incenseSticksHolder');
  let renderedStickCount = 0;

  function renderIncenseSticks(count) {
    const target = Math.max(3, Math.min(27, Number(count) || 9));
    if (target === renderedStickCount && incenseHolder.children.length > 0) return;
    renderedStickCount = target;
    incenseHolder.innerHTML = '';

    const tips = [];
    for (let i = 0; i < target; i++) {
      const stick = document.createElement('div');
      stick.className = 'incense-stick';

      const spread = target === 1 ? 0 : (i / (target - 1) - 0.5) * 2;
      const leftPx = 65 + spread * 28 + Math.sin(i * 2.1) * 2;
      const angleDeg = spread * 12 + Math.cos(i * 1.5) * 1.5;
      const heightPx = 76 + (i % 3) * 6;

      stick.style.left = `${leftPx}px`;
      stick.style.height = `${heightPx}px`;
      stick.style.transform = `rotate(${angleDeg}deg)`;

      const ember = document.createElement('div');
      ember.className = 'incense-ember';
      ember.style.animationDelay = `${(i * 0.15) % 1.1}s`;
      stick.appendChild(ember);
      incenseHolder.appendChild(stick);

      const rad = (angleDeg * Math.PI) / 180;
      const tipX = 540 + (leftPx - 65) + Math.sin(rad) * heightPx;
      const tipY = 895 - Math.cos(rad) * heightPx;
      tips.push({ x: tipX, y: tipY });
    }
    particles.setIncenseTips(tips);
  }

  // 4. Dựng Hàng 6 Đệm Quỳ VIP (chỉ người đã tặng Hoa Hồng, trên bục gỗ y=1188)
  const VIP_CUSHION_COORDS = [
    { x: 140, y: 1188, rank: 1 },
    { x: 268, y: 1188, rank: 2 },
    { x: 392, y: 1188, rank: 3 },
    { x: 688, y: 1188, rank: 4 },
    { x: 812, y: 1188, rank: 5 },
    { x: 940, y: 1188, rank: 6 }
  ];

  let lastRenderedVipJson = '';

  function renderVipCushions(vipDonors = []) {
    const layer = document.getElementById('vipCushionsLayer');
    if (!layer) return;

    // roseCount/avatar/lastRoseAt đều có thể thay đổi mà tên không đổi; đưa đúng các field
    // trực quan vào chữ ký nhưng bỏ merit để không dựng lại DOM theo mọi tương tác nhỏ.
    const top6 = vipDonors.slice(0, 6);
    const sig = JSON.stringify(
      top6.map((d) => [d.uniqueId, d.name, d.avatar || '', Number(d.roseCount) || 0, d.lastRoseAt || ''])
    );
    if (sig === lastRenderedVipJson) return;
    lastRenderedVipJson = sig;

    layer.innerHTML = VIP_CUSHION_COORDS.map((slot, idx) => {
      const dev = top6[idx];
      if (!dev) return '';
      const { outfitClass, scale } = resolveAppearance(dev);
      const initial = escapeHtml(String(dev.name || 'P').trim().charAt(0).toUpperCase() || 'P');
      const avatarHtml = dev.avatar
        ? `<img src="${escapeHtml(dev.avatar)}" alt="" class="vip-profile-image" decoding="async" onerror="this.remove()" />`
        : '';
      return `
        <div class="vip-devotee-slot vip-theme-${idx % 6}" style="left: ${slot.x}px; top: ${slot.y}px; z-index: ${12 + idx};">
          <div class="vip-seat-halo" aria-hidden="true"></div>
          <div class="devotee-wrap ${outfitClass}" style="transform: scale(${scale});">
            <img src="/assets/devotee.png" alt="VIP Devotee" class="devotee-sprite" />
          </div>
          <div class="vip-nameplate">
            <span class="vip-rank-medal">${slot.rank}</span>
            <span class="vip-profile-avatar">
              <span class="vip-avatar-fallback">${initial}</span>
              ${avatarHtml}
            </span>
            <span class="vip-copy">
              <span class="vip-rank-name">${escapeHtml(shortenName(dev.name, 10))}</span>
              <span class="vip-rose-count">🌹 x${Number(dev.roseCount || 0).toLocaleString('vi-VN')}</span>
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Dựng Đạo Tràng Phật Tử Quỳ Lễ Hai Bên Thảm Đỏ (tối đa 5 Hàng x 4 Cột mỗi bên = 40 chỗ)
  const congregationHall = document.getElementById('congregationHall');
  const HALL_SEAT_COORDS = [];
  // Thứ tự LẤP CHỖ: hàng gần nhất + cột gần thảm đỏ nhất trước (dễ thấy nhất), xen kẽ
  // trái/phải cho cân đối — CHỈ ghế có trong danh sách này + có người xem thật gán vào
  // mới được vẽ (xem renderCongregationHall), tuyệt đối không vẽ sprite lấp chỗ trống.
  const SEAT_FILL_ORDER = [];

  (function buildHallGrid() {
    const rows = 4;
    const colsPerSide = 5;
    const indexByKey = new Map();
    for (let r = 0; r < rows; r++) {
      const progress = r / (rows - 1); // 0 (xa) -> 1 (gần)
      // Đạo tràng người xem CHƯA tặng hoa được dời xuống thấp hơn bục đệm quỳ VIP (y=1188
      // trong VIP_CUSHION_COORDS) để chừa khoảng trống thoáng hơn ngay dưới bàn thờ/các nút
      // Thỉnh Chuông-Gõ Mõ-Xin Xăm (quanh y=895-975) và cho thấy rõ "đường lên chính điện"
      // khi có người thật hiện Dâng hoa/Cầu phúc/Xin xăm. Hàng gần nhất (progress=1) vẫn
      // phải có chân (điểm neo) nằm TRÊN vùng an toàn phía dưới (--safe-bottom trong live.css,
      // hiện 380px, tức y=1540) để không bị khung bình luận/nút quà tặng THẬT của TikTok che
      // mất — nếu chỉnh --safe-bottom lớn hơn trong CSS, hãy giảm mốc 1410 dưới đây tương ứng.
      const y = Math.round(1240 + progress * 245); // 1240 -> 1485
      const scale = +(0.62 + progress * 0.30).toFixed(2);

      // Cánh trái thảm đỏ
      const leftInnerX = Math.round(360 + progress * 30); // ôm sát hai mép thảm như khán giả LIVE
      // Chừa đủ biên cho nameplate (không bị stage cắt và tránh cột nút TikTok bên phải).
      const leftOuterX = 70;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(leftOuterX + t * (leftInnerX - leftOuterX));
        indexByKey.set(`L:${r}:${c}`, HALL_SEAT_COORDS.length);
        HALL_SEAT_COORDS.push({ side: 'L', row: r, col: c, x, y, scale });
      }

      // Cánh phải thảm đỏ
      const rightInnerX = Math.round(720 - progress * 30);
      const rightOuterX = 1010;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(rightInnerX + t * (rightOuterX - rightInnerX));
        indexByKey.set(`R:${r}:${c}`, HALL_SEAT_COORDS.length);
        HALL_SEAT_COORDS.push({ side: 'R', row: r, col: c, x, y, scale });
      }
    }

    // c đi từ cột GẦN thảm đỏ nhất (colsPerSide-1) ra ngoài, r đi từ hàng GẦN nhất
    // (rows-1, scale lớn nhất) ra xa dần — vừa dễ thấy vừa giữ đối xứng hai bên.
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = colsPerSide - 1; c >= 0; c--) {
        SEAT_FILL_ORDER.push(indexByKey.get(`L:${r}:${c}`));
        SEAT_FILL_ORDER.push(indexByKey.get(`R:${r}:${c}`));
      }
    }
  })();

  // Chỉ dùng biến thể trang phục + vóc dáng từ appearance. Không render hair-accent nữa:
  // sprite gốc đã có tóc và các lớp CSS hình học cũ chính là nguồn tạo oval xám sai ảnh.
  function resolveAppearance(viewer) {
    const a = viewer?.appearance;
    const outfitId = Number.isInteger(a?.outfitId) ? a.outfitId : 0;
    const scale = typeof a?.avatarScale === 'number' ? a.avatarScale : 1;
    return { outfitClass: `outfit-${outfitId}`, scale };
  }

  function renderSeatBadge(viewer, maxLen) {
    const roseMark = Number(viewer.roseCount) > 0
      ? `<span class="seat-rose-mark" title="Đã tặng Hoa Hồng">🌹</span>`
      : '';
    return `
      <div class="seat-badge${roseMark ? ' rose-supporter' : ''}">
        <span class="seat-avatar">${
          viewer.avatar
            ? `<img src="${escapeHtml(viewer.avatar)}" alt="" />`
            : escapeHtml(String(viewer.name || 'P').charAt(0).toUpperCase())
        }</span>
        <span class="seat-username">${escapeHtml(shortenName(viewer.name, maxLen))}</span>
        ${roseMark}
      </div>
    `;
  }

  let lastRenderedLeaderboardJson = '';

  function renderCongregationHall(regularViewers = []) {
    if (!congregationHall) return;
    // Server đã loại đúng 6 VIP đang ngồi hàng trên; danh sách này chỉ còn người thường
    // và donor vượt quá sức chứa VIP, không còn slice(6) theo bảng công đức như bản cũ.
    // Chỉ dựng lại DOM (và decode lại ảnh Phật tử) khi danh sách TÊN/AVATAR hiển thị
    // trên các thẻ tên thực sự thay đổi — khung này không hiển thị số công đức (giống
    // renderVipCushions ở trên), nên dùng merit làm khóa sẽ vô tình render lại toàn bộ
    // Phật tử mỗi khi AutoSim hoặc bất kỳ ai cộng thêm công đức (diễn ra liên tục mỗi ~9.5s
    // hoặc mỗi nghi thức), gây giật khung hình / nhấp nháy trên toàn màn hình chánh điện.
    const hallViewers = regularViewers.slice(0, SEAT_FILL_ORDER.length);
    const sig = JSON.stringify(
      hallViewers.map((d) => `${d.uniqueId || ''}:${d.name}:${d.avatar || ''}:${Number(d.roseCount) > 0 ? 1 : 0}`)
    );
    if (sig === lastRenderedLeaderboardJson && congregationHall.children.length > 0) return;
    lastRenderedLeaderboardJson = sig;

    // QUAN TRỌNG: không có người xem thật -> KHÔNG vẽ sprite nào cả (ghế để trống), tuyệt
    // đối không lấp chỗ trống bằng avatar giả — mỗi avatar vẽ ra đều gắn với đúng 1 thí chủ
    // thật đang có trong leaderboard (bình luận/tương tác TikTok thật, xem parseViewerComment).
    congregationHall.innerHTML = hallViewers
      .map((viewer, i) => {
        const seatIdx = SEAT_FILL_ORDER[i];
        const seat = HALL_SEAT_COORDS[seatIdx];
        if (!seat) return '';
        const { scale: appearanceScale } = resolveAppearance(viewer);
        const finalScale = +(seat.scale * appearanceScale).toFixed(3);
        return `
          <div
            class="hall-seat"
            data-seat-idx="${seatIdx}"
            style="left: ${seat.x}px; top: ${seat.y}px; z-index: ${20 + seat.row * 2}; transform: translate(-50%, -100%) scale(${finalScale});"
          >
            <div
              class="congregation-sprite crowd-variant-${seatIdx % 6}"
              style="--crowd-delay: ${((seatIdx * 0.19) % 3.2).toFixed(2)}s;"
              aria-hidden="true"
            ></div>
            ${renderSeatBadge(viewer, 11)}
          </div>
        `;
      })
      .join('');
  }

  // Preload toàn bộ 8 frame nhân vật vào bộ nhớ để chuyển frame mượt 0ms
  const SPRITE_FRAMES = {
    walk1: '/assets/devotee_walk.png',
    walk2: '/assets/devotee_walk_2.png',
    kneelDown: '/assets/devotee_kneel_down.png',
    kneel: '/assets/devotee.png',
    forehead: '/assets/devotee_bow.png',
    bowMid: '/assets/devotee_bow_mid.png',
    prostrate: '/assets/devotee_prostrate.png',
    prostrateDeep: '/assets/devotee_prostrate_deep.png'
  };
  Object.values(SPRITE_FRAMES).forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  function pulseHallBowing() {
    if (!congregationHall) return;
    const seats = congregationHall.querySelectorAll('.hall-seat');
    seats.forEach((el, i) => {
      if (i % 4 !== 0) return;
      const img = el.querySelector('.devotee-sprite');
      if (!img) return;
      const delay = (i % 4) * 80;
      setTimeout(() => { img.src = SPRITE_FRAMES.forehead; }, delay);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 140);
      setTimeout(() => { img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 300);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 620);
      setTimeout(() => { img.src = SPRITE_FRAMES.kneel; }, delay + 780);
    });
  }

  let prostrationTimers = [];
  function clearProstrationTimers() {
    while (prostrationTimers.length > 0) {
      clearTimeout(prostrationTimers.pop());
    }
  }

  // Chuyển đổi tức thời giữa 8 khung hình đã giải mã sẵn trên GPU (KHÔNG BAO GIỜ BỊ MẤT HÌNH)
  function setCentralPose(poseKey) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    const frames = stack.querySelectorAll('.pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  // Áp đúng biến thể TRANG PHỤC (lọc màu CSS, xem OUTFIT_VARIANTS trong server.js) lên toàn
  // bộ 8 khung hình Chủ Lễ — trang phục giữ NGUYÊN trong suốt lúc đi lên/hành lễ/mờ dần về
  // chỗ vì chỉ đổi 1 lần khi bắt đầu mỗi nghi thức, không đổi lại giữa chừng animation. Biến
  // thể TÓC (phụ kiện CSS) KHÔNG áp cho Chủ Lễ — xem ghi chú hạn chế ở đầu mục 4B trong
  // live.css: 8 tư thế có vị trí đầu khác nhau, không có điểm neo chung an toàn để tránh nổi/
  // lệch qua vai như yêu cầu, nên Chủ Lễ luôn dùng đúng tóc búi mặc định đã bake trong sprite.
  function setCentralOutfit(outfitId) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    for (let i = 0; i < 6; i++) stack.classList.remove(`outfit-${i}`);
    stack.classList.add(`outfit-${Number.isInteger(outfitId) ? outfitId : 0}`);
  }

  function schedulePose(ms, poseKey) {
    prostrationTimers.push(
      setTimeout(() => {
        setCentralPose(poseKey);
      }, ms)
    );
  }

  // Chuỗi 8 khung hình Đảnh lễ Tam Bái mượt mà (Hạ gối -> Chắp tay ngực -> Đưa lên trán -> Nghiêng 45° -> Chống tay -> Lạy sát đất -> Ngẩng lên)
  function playThreeBowsSequence(startDelayMs = 0) {
    schedulePose(startDelayMs, 'kneelDown');
    schedulePose(startDelayMs + 160, 'kneel');

    const bowOffsets = [startDelayMs + 320, startDelayMs + 1820, startDelayMs + 3320];
    bowOffsets.forEach((t0) => {
      schedulePose(t0, 'forehead');            // 1. Chắp tay đưa lên trán
      schedulePose(t0 + 170, 'bowMid');        // 2. Cúi gập lưng 45°
      schedulePose(t0 + 330, 'prostrate');     // 3. Vươn hai tay chống xuống đệm
      schedulePose(t0 + 490, 'prostrateDeep'); // 4. Lạy sát đất (Ngũ thể đầu địa)
      schedulePose(t0 + 860, 'prostrate');     // 5. Bắt đầu nâng đầu lên
      schedulePose(t0 + 1020, 'bowMid');       // 6. Nâng lưng lên góc 45°
      schedulePose(t0 + 1180, 'kneel');        // 7. Ngồi quỳ thẳng lưng
    });

    schedulePose(startDelayMs + 4800, 'forehead');
    schedulePose(startDelayMs + 5350, 'kneel');
  }

  // Lưu lại timer của hiệu ứng hào quang/cột sáng để huỷ timer cũ trước khi đặt timer mới.
  // Nếu không huỷ, hai nghi thức xảy ra gần nhau (vd: AutoSim + người xem thật cùng lúc,
  // hoặc Đại Lễ Kim Long gọi liên tiếp nhiều nghi thức) sẽ có timer CŨ tắt hào quang giữa
  // lúc hào quang của nghi thức MỚI đang cần sáng, gây tượng Phật/hào quang nhấp nháy tắt
  // rồi bật lại bất thường ngay trên khuôn mặt và tay Đức Phật.
  let beamIntenseTimer = null;
  let haloFlareTimer = null;
  let lotusFlareTimer = null;

  function updateCentralWorshipper(user, avatar, actionLabel, wish, doThreeBows = true, outfitId = 0) {
    const nameEl = document.getElementById('centralName');
    const actEl = document.getElementById('centralAction');
    const wishEl = document.getElementById('centralWishBubble');
    const avatarEl = document.getElementById('centralAvatar');
    const beam = document.getElementById('sacredLightBeam');

    if (nameEl) nameEl.textContent = user || 'Thí Chủ Hữu Duyên';
    if (actEl) actEl.textContent = actionLabel || '✨ Dâng hương cầu an';
    if (wishEl) wishEl.textContent = `“${wish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường'}”`;
    setCentralOutfit(outfitId);

    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
      } else {
        avatarEl.textContent = String(user || '🙏').trim().charAt(0).toUpperCase();
      }
    }

    if (doThreeBows) {
      clearProstrationTimers();
      const centralEl = document.getElementById('centralWorshipper');
      if (centralEl) centralEl.classList.remove('walking-up', 'walking-up-fast');
      playThreeBowsSequence(0);
    }
    if (beam) {
      beam.classList.add('intense');
      clearTimeout(beamIntenseTimer);
      beamIntenseTimer = setTimeout(() => beam.classList.remove('intense'), 4500);
    }

    const haloSys = document.getElementById('buddhaHaloSystem');
    const lotusHand = document.getElementById('lotusHandHalo');
    if (haloSys) {
      haloSys.classList.add('flare');
      clearTimeout(haloFlareTimer);
      haloFlareTimer = setTimeout(() => haloSys.classList.remove('flare'), 3600);
    }
    if (lotusHand) {
      lotusHand.classList.add('flare');
      clearTimeout(lotusFlareTimer);
      lotusFlareTimer = setTimeout(() => lotusHand.classList.remove('flare'), 3600);
    }
    particles.spawnBellWave(540, 260, 2);
  }

  // --------------------------------------------------------------------------
  // 5B. HÀNG ĐỢI NGHI THỨC TẠI CHÁNH ĐIỆN
  // --------------------------------------------------------------------------
  // Chỉ có 1 "chỗ" hiển thị Chủ Lễ trung tâm, nên MỌI sự kiện cần avatar lên chính điện
  // phải xếp hàng và chạy TUẦN TỰ — không chỉ riêng Hoa Hồng (vốn đã được dàn đều 6 giây/
  // lượt từ phía server, xem roseFortuneQueue trong server.js), mà cả burnIncense/ringBell
  // (kể cả do follow/share thật kích hoạt)/sendPrayer/offerGift/grandCeremony/drawFortune —
  // những nghi thức này có thể đến bất kỳ lúc nào từ nhiều người xem thật cùng lúc, và nếu
  // không xếp hàng ở đây sẽ cắt ngang hoạt cảnh người khác đang hành lễ giữa chừng ("không
  // để nhân vật chồng nhau" theo đúng yêu cầu).
  const CENTRAL_QUEUE_MAX = 40;
  const centralRitualQueue = [];
  let centralRitualBusy = false;

  function enqueueCentralRitual(taskFn) {
    if (centralRitualQueue.length >= CENTRAL_QUEUE_MAX) {
      centralRitualQueue.shift();
      console.warn('[CentralQueue] Hàng đợi nghi thức tại chính điện đã đầy, bỏ lượt chờ cũ nhất.');
    }
    centralRitualQueue.push(taskFn);
    processCentralRitualQueue();
  }

  function processCentralRitualQueue() {
    if (centralRitualBusy) return;
    const task = centralRitualQueue.shift();
    if (!task) return;
    centralRitualBusy = true;
    let settled = false;
    // Hẹn giờ an toàn: nếu 1 nghi thức vì lý do bất thường nào đó (vd TTS treo) không bao
    // giờ tự báo xong, hàng đợi vẫn phải được giải phóng sau tối đa 20s thay vì kẹt vĩnh viễn.
    const watchdog = setTimeout(() => {
      console.warn('[CentralQueue] Một nghi thức vượt quá thời gian chờ an toàn (20s) — bỏ qua để tránh kẹt hàng đợi.');
      finish();
    }, 20000);
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      centralRitualBusy = false;
      processCentralRitualQueue();
    }
    task(finish);
  }

  let fadeOutTimer = null;

  // Khởi động lại bước vào chính điện (dọn trạng thái mờ/animation cũ trước khi đặt lại).
  function resetCentralEntrance(fast) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;
    clearTimeout(fadeOutTimer);
    centralEl.classList.remove('ritual-fade-out', 'walking-up', 'walking-up-fast');
    void centralEl.offsetWidth;
    centralEl.classList.add(fast ? 'walking-up-fast' : 'walking-up');
  }

  // Sau khi hành lễ xong, Chủ Lễ mờ dần khỏi chính điện (coi như "trở về chỗ") rồi mới báo
  // hàng đợi được tiếp tục — kiến trúc hiện tại dùng ĐÚNG 1 vị trí trung tâm cố định cho mọi
  // lượt nghi thức (không lưu toạ độ ghế gốc của riêng từng người để dựng đường lùi chính
  // xác), nên "trở về chỗ" được thể hiện bằng việc biến mất khỏi chính điện thay vì một
  // hoạt cảnh đi lùi đầy đủ — xem báo cáo bàn giao để biết thêm chi tiết hạn chế này.
  function scheduleCentralFadeOutThenDone(delayMs, done) {
    const centralEl = document.getElementById('centralWorshipper');
    fadeOutTimer = setTimeout(() => {
      centralEl?.classList.add('ritual-fade-out');
      setTimeout(done, 520);
    }, delayMs);
  }

  // Hoạt cảnh ĐẦY ĐỦ (đi bộ 2.1s + Đảnh lễ Tam Bái ~5.35s) — dùng cho burnIncense/sendPrayer/
  // offerGift/grandCeremony, tổng hiển thị ~7.65s rồi mờ dần về chỗ.
  function playFullWalkRitual(user, avatar, actionLabel, wish, outfitId, done) {
    clearProstrationTimers();
    resetCentralEntrance(false);
    updateCentralWorshipper(user, avatar, actionLabel, wish, false, outfitId);
    setCentralPose('walk1');
    for (let step = 1; step <= 10; step++) {
      schedulePose(step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
    }
    prostrationTimers.push(setTimeout(() => {
      document.getElementById('centralWorshipper')?.classList.remove('walking-up', 'walking-up-fast');
    }, 2100));
    playThreeBowsSequence(2050);
    scheduleCentralFadeOutThenDone(2050 + 5350 + 250, done);
  }

  // Nghi thức TẠI CHỖ không cần đi bộ (ringBell) — xuất hiện ngay tại chính điện và thực
  // hiện Đảnh lễ Tam Bái đầy đủ, ~5.6s rồi mờ dần.
  function playInPlaceRitual(user, avatar, actionLabel, wish, outfitId, done) {
    clearProstrationTimers();
    const centralEl = document.getElementById('centralWorshipper');
    clearTimeout(fadeOutTimer);
    centralEl?.classList.remove('ritual-fade-out', 'walking-up', 'walking-up-fast');
    updateCentralWorshipper(user, avatar, actionLabel, wish, true, outfitId);
    scheduleCentralFadeOutThenDone(5350 + 250, done);
  }

  // 1 Hoa Hồng -> DÂNG HOA: bước vào nhanh (1s) + chắp tay dâng hoa ngắn gọn, KHÔNG phủ
  // phục sâu — tổng hiển thị đúng ~2 giây theo yêu cầu, rồi mờ dần về chỗ.
  function playQuickOfferRitual(user, avatar, actionLabel, wish, outfitId, done) {
    clearProstrationTimers();
    resetCentralEntrance(true);
    updateCentralWorshipper(user, avatar, actionLabel, wish, false, outfitId);
    setCentralPose('walk1');
    schedulePose(220, 'walk2');
    schedulePose(440, 'walk1');
    schedulePose(660, 'walk2');
    schedulePose(880, 'kneelDown');
    schedulePose(1000, 'kneel');
    schedulePose(1250, 'forehead');
    scheduleCentralFadeOutThenDone(2000, done);
  }

  // Combo 5 Hoa Hồng -> CẦU PHÚC: bước vào nhanh (1s) + MỘT lượt cúi nhẹ (không phủ phục
  // sâu như nghi thức đầy đủ) kèm ánh sáng beam/halo flare sẵn có — tổng hiển thị ~3 giây.
  function playLightBlessingRitual(user, avatar, actionLabel, wish, outfitId, done) {
    clearProstrationTimers();
    resetCentralEntrance(true);
    updateCentralWorshipper(user, avatar, actionLabel, wish, false, outfitId);
    setCentralPose('walk1');
    schedulePose(220, 'walk2');
    schedulePose(440, 'walk1');
    schedulePose(660, 'walk2');
    schedulePose(880, 'kneelDown');
    schedulePose(1000, 'kneel');
    schedulePose(1200, 'forehead');
    schedulePose(1450, 'bowMid');
    schedulePose(1850, 'forehead');
    schedulePose(2100, 'kneel');
    scheduleCentralFadeOutThenDone(2950, done);
  }

  // Combo 10 Hoa Hồng -> XIN XĂM: thời lượng phụ thuộc giọng đọc ZeroTTS thật (biến thiên),
  // nên không dùng mốc cố định như các nghi thức khác — chỉ báo hàng đợi xong khi modal quẻ
  // xăm đã đóng lại (audio.enqueueTts luôn gọi onEnd dù TTS lỗi/tắt, xem public/js/audio.js).
  function playDrawFortuneRitual(ev, done) {
    audio.playFortuneShake();
    const centralEl = document.getElementById('centralWorshipper');
    clearTimeout(fadeOutTimer);
    clearProstrationTimers();
    centralEl?.classList.remove('ritual-fade-out', 'walking-up', 'walking-up-fast');
    updateCentralWorshipper(
      ev.user,
      ev.avatar,
      `🎋 Đang xin xăm...`,
      `Thí chủ ${ev.user} đang thành tâm xin quẻ...`,
      false,
      ev.appearance?.outfitId || 0
    );
    audio.enqueueTts(ev.ttsText || '', {
      voice: ev.ttsVoice || 'maichi',
      onStart: () => {
        audio.playIncenseChime();
        showFortuneModal(ev.user, ev.fortune);
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `🎋 Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`,
          ev.fortune?.meaning || '',
          true,
          ev.appearance?.outfitId || 0
        );
      },
      onEnd: () => {
        clearTimeout(fortuneTimer);
        fortuneTimer = setTimeout(() => {
          document.getElementById('fortuneModal')?.classList.remove('visible');
          scheduleCentralFadeOutThenDone(50, done);
        }, 1800);
      }
    });
  }

  // 6. Cập nhật toàn bộ giao diện theo State từ Server
  let hasInitializedRealLeader = false;

  // Mục 8.1 — gợi ý ngữ cảnh ngắn, đổi dần mỗi ~7s, không che chánh điện hay nội dung
  // TikTok. Chỉ hiển thị khi guidanceHintsEnabled (Admin mục 11) đang bật.
  const GUIDANCE_HINTS = [
    'Bạn có thể bình luận: Cầu bình an',
    'Chào mừng quý thí chủ đến với chánh điện',
    'Xin mời cùng dành một phút an yên',
    'Gõ lời cầu nguyện để Đức Phật nghe thấy tâm thành của bạn'
  ];
  let guidanceTimer = null;
  let guidanceIndex = 0;
  let guidanceEnabledLast = null;

  function showNextGuidanceHint() {
    const pill = document.getElementById('guidanceHintPill');
    if (!pill) return;
    pill.textContent = GUIDANCE_HINTS[guidanceIndex % GUIDANCE_HINTS.length];
    guidanceIndex += 1;
    pill.classList.remove('hint-visible');
    void pill.offsetWidth; // buộc reflow để animation fade chạy lại mỗi câu mới
    pill.classList.add('hint-visible');
  }

  function setGuidanceHintsEnabled(enabled) {
    if (enabled === guidanceEnabledLast) return;
    guidanceEnabledLast = enabled;
    const pill = document.getElementById('guidanceHintPill');
    if (!enabled) {
      if (guidanceTimer) { clearInterval(guidanceTimer); guidanceTimer = null; }
      if (pill) pill.classList.remove('hint-visible');
      return;
    }
    showNextGuidanceHint();
    guidanceTimer = setInterval(showNextGuidanceHint, 7000);
  }

  // Mục 11 (Admin: Hiển thị, Hiệu ứng & Hiệu năng) — áp các công tắc cấu hình thành class
  // trên <body> để CSS xử lý (xem live.css khối "ADMIN DISPLAY TOGGLES"), cộng với việc
  // bật/tắt lớp hạt môi trường idle trong particles.js (không đụng hiệu ứng phản hồi thật).
  function applyDisplaySettings(settings = {}) {
    const body = document.body;
    body.classList.toggle('vip-effects-off', settings.vipEffectsEnabled === false);
    body.classList.remove('vip-intensity-low', 'vip-intensity-high');
    if (settings.vipEffectIntensity === 'low') body.classList.add('vip-intensity-low');
    if (settings.vipEffectIntensity === 'high') body.classList.add('vip-intensity-high');
    body.classList.toggle('nameplates-off', settings.regularNameplatesEnabled === false);
    body.classList.toggle('effects-reduced', Boolean(settings.reducedEffectsMode));

    const ambientOn = settings.ambientEffectsEnabled !== false && !settings.reducedEffectsMode;
    particles.setAmbientEnabled(ambientOn);

    setGuidanceHintsEnabled(settings.guidanceHintsEnabled !== false);
  }

  function updateUIState(st) {
    if (!st) return;

    document.getElementById('statIncense').textContent = Number(st.totalIncense || 0).toLocaleString('vi-VN');
    document.getElementById('statMerit').textContent = Number(st.totalMerit || 0).toLocaleString('vi-VN');
    document.getElementById('statWoodenFish').textContent = Number(st.woodenFishHits || 0).toLocaleString('vi-VN');

    renderIncenseSticks(st.activeIncenseSticks || 9);

    const lb = Array.isArray(st.leaderboard) ? st.leaderboard : [];
    // seating là nguồn dữ liệu mới phân tầng đúng theo Rose. Fallback giữ tương thích
    // nếu client mới tạm thời kết nối tới server cũ trong lúc cập nhật nóng.
    const vipDonors = Array.isArray(st.seating?.vip) ? st.seating.vip : lb.slice(0, 6);
    const regularViewers = Array.isArray(st.seating?.regular) ? st.seating.regular : lb.slice(6);
    renderVipCushions(vipDonors);
    renderCongregationHall(regularViewers);

    // Đồng bộ tên Chủ Lễ mặc định theo người dẫn đầu thực tế nếu chưa có sự kiện mới
    if (!hasInitializedRealLeader && lb.length > 0) {
      hasInitializedRealLeader = true;
      const topDev = lb[0];
      updateCentralWorshipper(
        topDev.name,
        topDev.avatar,
        `✨ Công đức: ${Number(topDev.merit).toLocaleString('vi-VN')} CĐ`,
        topDev.lastWish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường',
        false,
        topDev.appearance?.outfitId || 0
      );
    }

    // Cập nhật Bảng TẤM LÒNG THÀNH ở góc dưới phải (Top 4)
    const lbList = document.getElementById('leaderboardList');
    if (lbList) {
      lbList.innerHTML = lb
        .slice(0, 4)
        .map(
          (item) => `
          <div class="leader-item">
            <span class="leader-rank">${item.rank}</span>
            <span class="leader-name">${escapeHtml(shortenName(item.name, 14))}</span>
            <span class="leader-merit">${Number(item.merit).toLocaleString('vi-VN')}</span>
          </div>
        `
        )
        .join('');
    }

    // Trạng thái kết nối TikTok Live
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveStatusText');
    if (st.tiktok?.connected) {
      liveDot.classList.add('connected');
      liveText.textContent = `LIVE @${st.tiktok.username} • ${st.tiktok.viewerCount || 0} mắt`;
    } else if (st.tiktok?.connecting) {
      liveDot.classList.remove('connected');
      liveText.textContent = `Đang kết nối @${st.tiktok.username}...`;
    } else {
      liveDot.classList.remove('connected');
      liveText.textContent = st.settings?.autoSim
        ? 'CHÙA LINH ỨNG • TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI'
        : 'CHÙA LINH ỨNG • ĐỨC PHẬT A DI ĐÀ';
    }

    const btnAutoSim = document.getElementById('btnToggleAutoSim');
    if (btnAutoSim && st.settings) {
      // Server là nguồn sự thật duy nhất cho trạng thái AutoSim: lưu lại giá trị đã
      // được xác nhận để khi bấm nút, ta luôn gửi lên giá trị NGƯỢC với giá trị này
      // (không dùng biến cục bộ riêng dễ bị lệch khi reload trang hoặc RPC thất bại).
      confirmedAutoSim = Boolean(st.settings.autoSim);
      autoSimPending = false;
      btnAutoSim.disabled = false;
      btnAutoSim.textContent = confirmedAutoSim
        ? '🤖 Tự động Giả lập Người Xem: ĐANG BẬT'
        : '🤖 Tự động Giả lập Người Xem: TẮT';
      btnAutoSim.classList.toggle('active-toggle', confirmedAutoSim);
    }
    if (st.settings) {
      if (typeof st.settings.musicVolume === 'number') {
        audio.setMusicVolume(st.settings.musicVolume);
        const sMus = document.getElementById('sliderMusicVol');
        const vMus = document.getElementById('valMusicVol');
        const pct = Math.round(st.settings.musicVolume * 100);
        if (sMus) sMus.value = String(pct);
        if (vMus) vMus.textContent = `${pct}%`;
      }
      if (typeof st.settings.ttsVolume === 'number') {
        audio.setTtsVolume(st.settings.ttsVolume);
        const sTts = document.getElementById('sliderTtsVol');
        const vTts = document.getElementById('valTtsVol');
        const pct = Math.round(st.settings.ttsVolume * 100);
        if (sTts) sTts.value = String(pct);
        if (vTts) vTts.textContent = `${pct}%`;
      }
      applyDisplaySettings(st.settings);
    }


    const feed = document.getElementById('eventFeed');
    if (feed && Array.isArray(st.recentEvents)) {
      feed.innerHTML = st.recentEvents
        .slice(0, 8)
        .map((ev) => `<div class="event-feed-item">${formatEventSummary(ev)}</div>`)
        .join('');
    }
  }

  function formatEventSummary(ev) {
    switch (ev.type) {
      case 'burnIncense':
        return `🔥 <strong>${escapeHtml(ev.user)}</strong> dâng ${ev.count} nén nhang (+${ev.merit} CĐ)`;
      case 'strikeWoodenFish':
        return `🪵 <strong>${escapeHtml(ev.user)}</strong> gõ mõ ${ev.count} nhịp (+${ev.merit} CĐ)`;
      case 'ringBell':
        return `🔔 <strong>${escapeHtml(ev.user)}</strong> thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`;
      case 'sendPrayer':
        return `🏮 <strong>${escapeHtml(ev.user)}</strong> cầu phúc: “${escapeHtml(ev.wish)}”`;
      case 'offerGift':
      case 'grandCeremony':
        return `🪷 <strong>${escapeHtml(ev.user)}</strong> dâng <em>${escapeHtml(ev.giftName)}</em> (+${ev.merit} CĐ)`;
      case 'offerFlower':
        return `🌹 <strong>${escapeHtml(ev.user)}</strong> dâng hoa (+${ev.merit} CĐ)`;
      case 'blessingRose':
        return `🌸 <strong>${escapeHtml(ev.user)}</strong> gửi lời cầu phúc (+${ev.merit} CĐ)`;
      case 'drawFortune':
        return `🎋 <strong>${escapeHtml(ev.user)}</strong> gieo được Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`;
      case 'viewerComment':
        return `💬 <strong>${escapeHtml(ev.user)}</strong>: ${escapeHtml(ev.comment || '')}`;
      default:
        return `✨ <strong>${escapeHtml(ev.user || 'Thí chủ')}</strong> tương tác`;
    }
  }

  // 7. Xử lý hiệu ứng khi có Nghi Thức mới
  let fortuneTimer = null;
  let grandTimer = null;

  function triggerRitualVisuals(ev) {
    if (!ev) return;

    // Bình luận CHỈ đưa người xem "vào chùa" (ngồi vào ghế đạo tràng, xem renderCongregationHall,
    // và vào Nhật Ký Tương Tác #eventFeed trong Bảng Điều Khiển Nhanh) — KHÔNG chạy qua bất kỳ
    // hoạt cảnh nghi thức nào (không lên chính điện, không TTS, không cộng công đức) dù nội
    // dung trùng từ khóa nghi thức (xem parseViewerComment ở server), và không hiển thị gì
    // thêm trên overlay LIVE công khai (dải tên/trạng thái dạng thanh ngang đã được bỏ).
    if (ev.type === 'viewerComment') {
      return;
    }

    // Trang phục của Chủ Lễ trong suốt hoạt cảnh = đúng appearance đã gieo cho người thực
    // hiện nghi thức (xem server.js rollAppearance/pushEventLog) — ổn định, không random.
    const outfitId = Number.isInteger(ev.appearance?.outfitId) ? ev.appearance.outfitId : 0;

    // TỪ ĐÂY MỖI NGHI THỨC CHẠM TỚI CHỦ LỄ TRUNG TÂM ĐƯỢC ĐƯA VÀO HÀNG ĐỢI (xem mục 5B) —
    // âm thanh/hạt hiệu ứng/giọng đọc được kích hoạt BÊN TRONG mỗi task, đúng lúc đến lượt,
    // để không bị lệch với avatar đang hiển thị khi hàng đợi có nhiều lượt chờ.
    switch (ev.type) {
      case 'burnIncense': {
        enqueueCentralRitual((done) => {
          if (ev.ttsText) audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
          audio.playIncenseChime();
          particles.spawnIncenseBurst(540, 895);
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 860, '#ffe082');
          playFullWalkRitual(ev.user, ev.avatar, `🔥 Dâng ${ev.count} nén hương (+${ev.merit} CĐ)`, ev.wish, outfitId, done);
        });
        break;
      }

      case 'strikeWoodenFish': {
        // Không chạm Chủ Lễ trung tâm (chỉ gõ mõ tại chỗ) -> không cần xếp hàng.
        audio.playWoodenFish();
        pulseHallBowing();
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 890, 935, '#ffd54f');
        break;
      }

      case 'ringBell': {
        enqueueCentralRitual((done) => {
          if (ev.ttsText) audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
          audio.playTempleBell(1.0);
          pulseHallBowing();
          particles.spawnBellWave(540, 510, 4);
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 190, 935, '#fff3b0');
          playInPlaceRitual(ev.user, ev.avatar, `🔔 Thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`, ev.wish, outfitId, done);
        });
        break;
      }

      case 'sendPrayer': {
        enqueueCentralRitual((done) => {
          if (ev.ttsText) audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
          audio.playIncenseChime();
          spawnSkyLantern(ev.user, ev.wish);
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 920, '#ffb74d');
          playFullWalkRitual(ev.user, ev.avatar, `🏮 Cầu phúc (+${ev.merit} CĐ)`, ev.wish, outfitId, done);
        });
        break;
      }

      case 'offerGift': {
        enqueueCentralRitual((done) => {
          if (ev.ttsText) audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
          audio.playIncenseChime();
          audio.playTempleBell(0.85);
          particles.spawnIncenseBurst(540, 895);
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 840, '#fff3b0');
          playFullWalkRitual(ev.user, ev.avatar, `🪷 Dâng ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish, outfitId, done);
        });
        break;
      }

      // 1 Hoa Hồng -> Dâng hoa: hoạt cảnh ngắn gọn (~2s) lên chính điện dâng bó hoa rồi về chỗ.
      case 'offerFlower': {
        enqueueCentralRitual((done) => {
          audio.playIncenseChime();
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 860, '#ff9eb0');
          playQuickOfferRitual(ev.user, ev.avatar, `🌹 Dâng hoa (+${ev.merit} CĐ)`, 'Thành tâm dâng hoa kính lễ', outfitId, done);
        });
        break;
      }

      // 5 Hoa Hồng -> Cầu phúc: hiệu ứng ánh sáng nhẹ (beam/halo flare có sẵn trong
      // updateCentralWorshipper) + hoa, ~3s, KHÔNG dùng hiệu ứng đèn hoa đăng của sendPrayer.
      case 'blessingRose': {
        enqueueCentralRitual((done) => {
          audio.playIncenseChime();
          audio.playTempleBell(0.7);
          particles.spawnBellWave(540, 700, 3);
          particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 860, '#ffe9a8');
          playLightBlessingRitual(ev.user, ev.avatar, `🌸 Cầu phúc (+${ev.merit} CĐ)`, 'Cầu bình an cho bạn và gia đình', outfitId, done);
        });
        break;
      }

      case 'grandCeremony': {
        enqueueCentralRitual((done) => {
          if (ev.ttsText) audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
          audio.playTempleBell(1.2);
          setTimeout(() => audio.playTempleBell(1.1), 900);
          particles.spawnGrandCeremonyRain();
          pulseHallBowing();
          showGrandCeremonyBanner(ev.user, ev.giftName, ev.merit);
          playFullWalkRitual(ev.user, ev.avatar, `🐉 ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish, outfitId, done);
        });
        break;
      }

      case 'drawFortune': {
        enqueueCentralRitual((done) => {
          playDrawFortuneRitual(ev, done);
        });
        break;
      }
    }
  }

  function spawnSkyLantern(user, wish) {
    const layer = document.getElementById('skyLanternsLayer');
    if (!layer) return;
    const lantern = document.createElement('div');
    lantern.className = 'sky-lantern';
    const leftPos = 80 + Math.floor(Math.random() * 640);
    lantern.style.left = `${leftPos}px`;
    lantern.innerHTML = `
      <div class="sky-lantern-user">🙏 ${escapeHtml(user)}</div>
      <div class="sky-lantern-wish">“${escapeHtml(wish)}”</div>
    `;
    layer.appendChild(lantern);
    setTimeout(() => {
      lantern.remove();
    }, 10600);
  }

  function showFortuneModal(user, fortune) {
    if (!fortune) return;
    const modal = document.getElementById('fortuneModal');
    document.getElementById('fortuneRankBadge').textContent = fortune.rank.toUpperCase();
    document.getElementById('fortuneTitle').textContent = `Quẻ Số ${fortune.number} — ${fortune.title}`;
    document.getElementById('fortuneDevotee').textContent = `Thí chủ cầu quẻ: ${user}`;
    document.getElementById('fortunePoem').textContent = fortune.poem;
    document.getElementById('fortuneMeaning').textContent = `Lời bàn: ${fortune.meaning}`;

    modal.classList.add('visible');
    clearTimeout(fortuneTimer);
    fortuneTimer = setTimeout(() => {
      modal.classList.remove('visible');
    }, 15000);
  }

  document.getElementById('fortuneModal')?.addEventListener('click', () => {
    document.getElementById('fortuneModal').classList.remove('visible');
  });

  function showGrandCeremonyBanner(user, giftName, merit) {
    const banner = document.getElementById('grandCeremonyBanner');
    document.getElementById('grandTitle').textContent = `🐉 ${giftName.toUpperCase()} 🐉`;
    document.getElementById('grandSub').textContent = `Đại Thí Chủ ${user} • Công Đức Vô Lượng (+${merit} CĐ)`;
    banner.classList.add('visible');
    clearTimeout(grandTimer);
    grandTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 6800);
  }

  // 8. Kết nối JSON-RPC 2.0 WebSocket & Gửi Lệnh RPC
  let ws = null;
  let rpcId = 1;
  // Tự phục hồi kết nối với backoff tăng dần (1s -> 2s -> 4s -> ... tối đa 15s)
  // thay vì dồn dập thử lại mỗi 2s cố định, tránh làm nghẽn server khi mất mạng dài.
  const WS_RECONNECT_BASE_MS = 1000;
  const WS_RECONNECT_MAX_MS = 15000;
  let wsReconnectAttempt = 0;

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onopen = () => {
      wsReconnectAttempt = 0; // kết nối thành công -> reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'temple.state') {
          updateUIState(msg.params);
        } else if (msg.method === 'temple.event') {
          if (msg.params?.state) updateUIState(msg.params.state);
          if (msg.params?.event) triggerRitualVisuals(msg.params.event);
        } else if (msg.method === 'tts.play') {
          if (msg.params?.url) {
            audio.enqueueTts(msg.params.text || 'Nam mô A Di Đà Phật', {
              voice: msg.params.voice || 'maichi',
              url: msg.params.url
            });
          }
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      const delay = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_BASE_MS * Math.pow(2, wsReconnectAttempt));
      wsReconnectAttempt += 1;
      setTimeout(connectWebSocket, delay);
    };
  }
  connectWebSocket();

  async function callRpc(method, params = {}) {
    audio.ensureContext();
    const payload = {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data?.result?.state) updateUIState(data.result.state);
    if (data?.result?.event) triggerRitualVisuals(data.result.event);
    return data;
  }

  function getFormInput() {
    const user = document.getElementById('inputDevoteeName')?.value.trim() || 'Quỳnh_Finn';
    const wish =
      document.getElementById('inputDevoteeWish')?.value.trim() ||
      'Cầu cho gia đình bình an, tài lộc hanh thông';
    return { user, wish };
  }

  // Gắn sự kiện tương tác trực tiếp trên màn hình 9:16 & Thanh HUD dưới đáy
  document.getElementById('incenseBurnerZone')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  // 3 ô Dâng hoa / Cầu phúc / Xin xăm: mô phỏng ĐÚNG qua pipeline Rose thật (live.mockEvent
  // gift, diamondCount=1) thay vì gọi thẳng Rituals.*, để nút bấm xem thử trên desktop cũng
  // đi qua cùng cơ chế mốc 1/5/10 với quà Rose thật trên TikTok.
  document.getElementById('cardIncense')?.addEventListener('click', () => {
    callRpc('live.mockEvent', { type: 'gift', diamondCount: 1, repeatCount: 1, repeatEnd: true });
  });

  document.getElementById('cardBlessing')?.addEventListener('click', () => {
    callRpc('live.mockEvent', { type: 'gift', diamondCount: 1, repeatCount: 5, repeatEnd: true });
  });

  document.getElementById('cardLotus')?.addEventListener('click', () => {
    callRpc('live.mockEvent', { type: 'gift', diamondCount: 1, repeatCount: 10, repeatEnd: true });
  });

  document.getElementById('woodenFishStation')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 1 });
  });

  document.getElementById('bellStation')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('fortuneCylinder')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  // Các nút trên Quick RPC Dock bên phải
  document.getElementById('btnRpcIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('btnRpcLantern')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  document.getElementById('btnRpcWoodenFish')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 5 });
  });

  document.getElementById('btnRpcBell')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('btnRpcFortune')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  document.getElementById('btnRpcGiftLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 20,
      giftName: 'Đài Hoa Sen Vàng',
      wish
    });
  });

  document.getElementById('btnRpcGrandCeremony')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.grandCeremony', {
      user,
      coins: 299,
      giftName: 'Đại Lễ Kim Long Chầu Phật',
      wish
    });
  });

  document.getElementById('btnConnectTikTok')?.addEventListener('click', () => {
    const username = document.getElementById('inputTikTokUser')?.value.trim();
    if (!username) return;
    callRpc('live.connect', { username });
  });

  // Trạng thái AutoSim đã được SERVER xác nhận lần gần nhất (đồng bộ trong updateUIState).
  // Khởi tạo undefined để không gửi lệnh nào trước khi nhận được temple.state đầu tiên.
  let confirmedAutoSim;
  let autoSimPending = false;
  document.getElementById('btnToggleAutoSim')?.addEventListener('click', (e) => {
    if (autoSimPending || confirmedAutoSim === undefined) return; // chống double-click / gửi trùng lệnh
    autoSimPending = true;
    const btn = e.currentTarget;
    btn.disabled = true;
    const nextVal = !confirmedAutoSim;
    callRpc('live.setAutoSim', { enabled: nextVal });
    // Nhả khóa sau một khoảng an toàn nếu không có xác nhận nào trả về (ví dụ mất kết nối
    // WebSocket) — tránh nút bị "kẹt" vô thời hạn khi RPC thất bại hoặc không phản hồi.
    setTimeout(() => {
      autoSimPending = false;
      btn.disabled = false;
    }, 4000);
  });

  document.getElementById('btnToggleTts')?.addEventListener('click', (e) => {
    audio.ttsEnabled = !audio.ttsEnabled;
    const btn = e.currentTarget;
    btn.textContent = `🎙️ Giọng Đọc: ${audio.ttsEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.ttsEnabled);
  });

  document.getElementById('btnToggleMusic')?.addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    const btn = e.currentTarget;
    btn.textContent = `🎵 Nhạc Nền: ${audio.bgMusicEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.bgMusicEnabled);
  });

  // Khởi tạo và gắn sự kiện thanh trượt chỉnh âm lượng Nhạc nền & Giọng đọc
  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol && valMusicVol) {
    const initMusPct = Math.round(audio.bgBaseVolume * 100);
    sliderMusicVol.value = String(initMusPct);
    valMusicVol.textContent = `${initMusPct}%`;
    sliderMusicVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valMusicVol.textContent = `${pct}%`;
      audio.ensureContext();
      audio.setMusicVolume(pct / 100);
    });
    sliderMusicVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { musicVolume: +(pct / 100).toFixed(2) });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol && valTtsVol) {
    const initTtsPct = Math.round(audio.ttsVolume * 100);
    sliderTtsVol.value = String(initTtsPct);
    valTtsVol.textContent = `${initTtsPct}%`;
    sliderTtsVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valTtsVol.textContent = `${pct}%`;
      audio.setTtsVolume(pct / 100);
    });
    sliderTtsVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { ttsVolume: +(pct / 100).toFixed(2) });
    });
  }

  function shortenName(name, maxLen = 13) {
    const str = String(name || '');
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
