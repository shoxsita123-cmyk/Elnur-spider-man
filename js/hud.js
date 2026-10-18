/* HUD: bars, markers, minimap, banners, floating text */
(function () {
  'use strict';
  const G = window.G, T = THREE;
  const H = (G.HUD = {});
  let el = {}, cv, cx, mini, mx, mapImg, W = 0, Hh = 0, popups = [], bannerTimer = null, toastQ = [];
  const _v = new T.Vector3();
  const MAP_R = 520, MAP_PPM = 0.5;

  H.init = function () {
    ['hpFill', 'hpText', 'score', 'hiscore', 'combo', 'missionTitle', 'missionObj', 'missionProg', 'missionTimer', 'speed', 'crosshair', 'banner', 'bannerTitle', 'bannerSub', 'toasts',
      'dmgFlash', 'bossBar', 'bossFill', 'speedLines', 'fps', 'hint'].forEach((id) => (el[id] = G.$(id)));
    cv = G.$('hudCanvas'); cx = cv.getContext('2d');
    mini = G.$('minimap'); mx = mini.getContext('2d');
    H.resize();
  };

  H.resize = function () {
    W = cv.width = window.innerWidth; Hh = cv.height = window.innerHeight;
  };

  H.buildMinimap = function (city) {
    const S = MAP_R * 2 * MAP_PPM;
    mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = S;
    const c = mapImg.getContext('2d');
    c.fillStyle = '#0d1226'; c.fillRect(0, 0, S, S);
    const tr = (v) => (v + MAP_R) * MAP_PPM;
    // roads
    c.fillStyle = '#2a3150';
    const P = G.CITY.PITCH;
    for (let k = -6; k <= 5; k++) {
      const p = (k + 0.5) * P;
      c.fillRect(tr(p) - 11 * MAP_PPM, 0, 22 * MAP_PPM, S);
      c.fillRect(0, tr(p) - 11 * MAP_PPM, S, 22 * MAP_PPM);
    }
    // parks
    c.fillStyle = '#1f5a3a';
    for (const p of city.parks) c.fillRect(tr(p.x - 30), tr(p.z - 30), 60 * MAP_PPM, 60 * MAP_PPM);
    for (const r of city.rects) {
      const t = G.clamp(r.h / 200, 0, 1);
      const R = Math.round(90 + 150 * t), Gc = Math.round(150 - 70 * t), B = Math.round(190 + 20 * t);
      c.fillStyle = 'rgb(' + R + ',' + Gc + ',' + B + ')';
      c.fillRect(tr(r.x - r.w / 2), tr(r.z - r.d / 2), r.w * MAP_PPM, r.d * MAP_PPM);
    }
  };

  H.popup = function (x, y, z, text, color) {
    if (popups.length > 30) popups.shift();
    popups.push({ x, y, z, text, color: color || '#fff', t: 0 });
  };

  H.banner = function (title, sub, good, bad) {
    const b = el.banner;
    el.bannerTitle.textContent = title; el.bannerSub.textContent = sub || '';
    b.className = 'show' + (good ? ' good' : '') + (bad ? ' bad' : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.className = ''; }, 4200);
  };

  H.toast = function (msg, dur) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), (dur || 3) * 1000);
    setTimeout(() => d.remove(), (dur || 3) * 1000 + 600);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  };

  H.hint = function (msg) { el.hint.textContent = msg || ''; el.hint.style.opacity = msg ? 1 : 0; };

  H.damage = function () {
    el.dmgFlash.style.transition = 'none'; el.dmgFlash.style.opacity = 0.9;
    requestAnimationFrame(() => { el.dmgFlash.style.transition = 'opacity 0.6s'; el.dmgFlash.style.opacity = 0; });
  };

  function project(x, y, z, cam, out) {
    _v.set(x, y, z);
    const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z;
    const f = G.game.cam.dir;
    const dotf = dx * f.x + dy * f.y + dz * f.z;
    _v.project(cam);
    out.x = (_v.x * 0.5 + 0.5) * W; out.y = (-_v.y * 0.5 + 0.5) * Hh; out.behind = dotf < 0.1; out.depth = dotf;
    return out;
  }
  const _s = { x: 0, y: 0, behind: false, depth: 0 };

  H.update = function (dt) {
    const g = G.game, P = g.player;
    el.hpFill.style.width = (P.hp / P.maxHp * 100).toFixed(1) + '%';
    el.hpFill.className = P.hp < 30 ? 'low' : '';
    el.hpText.textContent = Math.ceil(P.hp);
    el.score.textContent = Math.floor(g.scoreShown).toLocaleString();
    el.hiscore.textContent = 'BEST ' + Math.floor(g.hiscore).toLocaleString();
    if (g.combo > 1 && g.comboT > 0) { el.combo.textContent = 'COMBO x' + g.comboMult().toFixed(1) + '  (' + g.combo + ')'; el.combo.style.opacity = Math.min(1, g.comboT); }
    else el.combo.style.opacity = 0;
    const kmh = Math.round(P.speed * 3.6);
    el.speed.textContent = kmh + ' km/h';
    el.crosshair.className = (P.canWeb ? 'ready ' : '') + (P.state === 'swing' ? 'swing' : '');
    el.speedLines.style.opacity = G.clamp((P.speed - 28) / 35, 0, 0.9);
    const m = G.Missions.cur;
    if (m) {
      el.missionTitle.textContent = 'MISSION ' + (G.Missions.index + 1) + ': ' + m.title.toUpperCase();
      el.missionObj.textContent = m.objective();
      el.missionProg.textContent = m.progress();
      if (m.timer) { const t = Math.max(0, m.timer()); el.missionTimer.textContent = '⏱ ' + t.toFixed(1) + 's'; el.missionTimer.style.display = 'block'; el.missionTimer.className = t < 12 ? 'low' : ''; }
      else el.missionTimer.style.display = 'none';
    } else if (G.Missions.wait > 0) {
      el.missionObj.textContent = 'Next mission incoming…'; el.missionProg.textContent = ''; el.missionTimer.style.display = 'none';
    }
    if (g.boss && !g.boss.dead) { el.bossBar.style.display = 'block'; el.bossFill.style.width = (g.boss.hp / g.boss.maxHp * 100) + '%'; }
    else el.bossBar.style.display = 'none';
  };

  H.draw = function (dt, camera) {
    cx.clearRect(0, 0, W, Hh);
    const g = G.game, P = g.player;
    const cam = camera;
    // enemy health bars
    for (const e of G.Enemies.list) {
      if (e.dead) continue;
      const dx = e.body.x - P.body.x, dz = e.body.z - P.body.z;
      if (dx * dx + dz * dz > 70 * 70) continue;
      project(e.body.x, e.body.y + e.body.h + (e.type === 'drone' ? 0.8 : 0.5), e.body.z, cam, _s);
      if (_s.behind) continue;
      const w = e.type === 'boss' ? 90 : 48, hgt = 5;
      const x = _s.x - w / 2, y = _s.y - 4;
      cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(x - 1, y - 1, w + 2, hgt + 2);
      cx.fillStyle = e.stun > 0 ? '#9fe7ff' : (e.type === 'drone' ? '#ff9a3a' : '#ff4a4a'); cx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), hgt);
    }
    // mission markers
    const m = G.Missions.cur;
    if (m) {
      const ms = m.markers();
      for (const mk of ms) {
        project(mk.x, mk.y, mk.z, cam, _s);
        const d = Math.hypot(mk.x - P.body.x, mk.y - P.body.y, mk.z - P.body.z);
        if (mk.small) {
          if (_s.behind || d > 120) continue;
          cx.fillStyle = mk.color; cx.beginPath(); cx.moveTo(_s.x, _s.y - 22); cx.lineTo(_s.x - 5, _s.y - 30); cx.lineTo(_s.x + 5, _s.y - 30); cx.fill();
          continue;
        }
        let sx = _s.x, sy = _s.y, off = false;
        if (_s.behind) { sx = W - sx; sy = Hh - sy; off = true; }
        const mg = 46;
        if (sx < mg || sx > W - mg || sy < mg || sy > Hh - mg) off = true;
        const cxs = W / 2, cys = Hh / 2;
        if (off) {
          let ang = Math.atan2(sy - cys, sx - cxs);
          const k = Math.min((W / 2 - mg) / Math.max(1e-3, Math.abs(Math.cos(ang))), (Hh / 2 - mg) / Math.max(1e-3, Math.abs(Math.sin(ang))));
          sx = cxs + Math.cos(ang) * k; sy = cys + Math.sin(ang) * k;
          cx.save(); cx.translate(sx, sy); cx.rotate(ang);
          cx.fillStyle = mk.color; cx.shadowColor = mk.color; cx.shadowBlur = 12;
          cx.beginPath(); cx.moveTo(16, 0); cx.lineTo(-8, -11); cx.lineTo(-3, 0); cx.lineTo(-8, 11); cx.fill(); cx.restore();
        } else {
          cx.save(); cx.translate(sx, sy); cx.rotate(Math.PI / 4);
          cx.strokeStyle = mk.color; cx.lineWidth = 3; cx.shadowColor = mk.color; cx.shadowBlur = 14; cx.strokeRect(-9, -9, 18, 18); cx.restore();
        }
        cx.font = 'bold 13px Segoe UI, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.shadowColor = '#000'; cx.shadowBlur = 4;
        cx.fillText((mk.label ? mk.label + '  ' : '') + Math.round(d) + 'm', sx, sy + (off ? 30 : 30));
        cx.shadowBlur = 0;
      }
    }
    // popups
    cx.textAlign = 'center';
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]; p.t += dt;
      if (p.t > 1.1) { popups.splice(i, 1); continue; }
      project(p.x, p.y + p.t * 1.5, p.z, cam, _s);
      if (_s.behind) continue;
      cx.globalAlpha = 1 - Math.pow(p.t / 1.1, 2);
      cx.font = 'bold 20px Segoe UI, sans-serif'; cx.fillStyle = p.color; cx.shadowColor = '#000'; cx.shadowBlur = 5;
      cx.fillText(p.text, _s.x, _s.y);
      cx.globalAlpha = 1; cx.shadowBlur = 0;
    }
    H.drawMinimap();
  };

  H.drawMinimap = function () {
    if (!mapImg) return;
    const S = mini.width, c = S / 2, g = G.game, P = g.player.body;
    const view = 280, s = S / view;
    mx.clearRect(0, 0, S, S);
    mx.save();
    mx.beginPath(); mx.arc(c, c, c - 2, 0, Math.PI * 2); mx.clip();
    mx.fillStyle = '#0a0e1c'; mx.fillRect(0, 0, S, S);
    mx.translate(c, c); mx.rotate(g.cam.yaw - Math.PI); mx.scale(s, s); mx.translate(-P.x, -P.z);
    mx.imageSmoothingEnabled = true;
    mx.drawImage(mapImg, -MAP_R, -MAP_R, MAP_R * 2, MAP_R * 2);
    const dot = (x, z, col, r) => { mx.fillStyle = col; mx.beginPath(); mx.arc(x, z, r / s, 0, 6.3); mx.fill(); };
    for (const e of G.Enemies.list) if (!e.dead) dot(e.body.x, e.body.z, e.type === 'drone' ? '#ffa23a' : '#ff4a4a', 3.2);
    for (const p of G.Pickups.list) dot(p.x, p.z, '#5dff9c', 3);
    const m = G.Missions.cur;
    if (m) for (const mk of m.markers()) {
      let x = mk.x, z = mk.z;
      const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz), lim = (view / 2 - 10);
      if (d > lim) { x = P.x + dx / d * lim; z = P.z + dz / d * lim; }
      if (!mk.small) { dot(x, z, mk.color, 6.5); mx.strokeStyle = '#fff'; mx.lineWidth = 1.5 / s; mx.beginPath(); mx.arc(x, z, 8 / s, 0, 6.3); mx.stroke(); }
    }
    mx.restore();
    // player arrow
    mx.fillStyle = '#ffffff'; mx.strokeStyle = '#d91e2c'; mx.lineWidth = 2;
    mx.beginPath(); mx.moveTo(c, c - 9); mx.lineTo(c + 6, c + 7); mx.lineTo(c, c + 3); mx.lineTo(c - 6, c + 7); mx.closePath(); mx.fill(); mx.stroke();
    mx.strokeStyle = 'rgba(160,190,255,0.7)'; mx.lineWidth = 3; mx.beginPath(); mx.arc(c, c, c - 2, 0, Math.PI * 2); mx.stroke();
  };
})();
