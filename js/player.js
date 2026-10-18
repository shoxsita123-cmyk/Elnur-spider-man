/* Player: movement, jumping, web-swinging, wall climbing, combat */
(function () {
  'use strict';
  const G = window.G, T = THREE, W = G.World;

  const WALK = 7.5, RUN = 15.5, JUMP = 12.2, GRAV = 31, TERM = -70, MAXV = 70;
  const CHEST = 1.25;

  G.createPlayer = function (scene) {
    const hero = G.buildHumanoid('hero', 1);
    scene.add(hero.root);
    const webLine = G.FX.makeLine([2.4, 2.6, 3.2], 0.03, 0.95);
    scene.add(webLine);
    const webLine2 = G.FX.makeLine([1.2, 1.5, 2.2], 0.012, 0.6);
    scene.add(webLine2);

    const p = {
      hero,
      body: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hw: 0.38, h: 1.8, stepOK: false },
      res: W.newResult(),
      state: 'air', hp: 100, maxHp: 100, dead: false,
      yaw: 0, web: null, zip: null, climbN: { x: 0, z: 1 },
      coyote: 0, jumpBuf: 0, jumping: false, invuln: 0, sinceHurt: 99,
      landT: 0, strikeCd: 0, strikeElapsed: -1, strikeSide: 0, strikeHit: false, webCd: 0,
      wallPress: 0, climbCool: 0, climbLost: 0, prevGrounded: false, prevVy: 0,
      swingDist: 0, swingStartX: 0, swingStartZ: 0, canWeb: false, previewT: 0, previewAnchor: null,
      speed: 0, hspeed: 0, dustT: 0, carHit: 0, lockT: 0, lockYaw: 0, stats: { swings: 0, climbs: 0, jumps: 0 }
    };
    const _h = new T.Vector3(), _a = new T.Vector3(), _hit = {};

    p.reset = function (x, y, z, yaw) {
      const b = p.body;
      b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0;
      p.hp = p.maxHp; p.dead = false; p.state = 'air'; p.web = null; p.zip = null; p.yaw = yaw || 0;
      p.invuln = 1; p.res.groundBox = null; webLine.visible = false; webLine2.visible = false;
      hero.root.visible = true; hero.root.rotation.set(0, p.yaw, 0);
    };

    p.chest = function (out) { return out.set(p.body.x, p.body.y + CHEST, p.body.z); };

    // ---------------------------------------------------------------- web anchor search
    function setAnchor(h) { return { x: h.x + h.nx * 0.05, y: h.y + h.ny * 0.05, z: h.z + h.nz * 0.05, nx: h.nx, ny: h.ny, nz: h.nz }; }

    p.findAnchor = function (relaxed) {
      const cam = G.game.cam, b = p.body;
      const px = b.x, py = b.y + 1.4, pz = b.z;
      let t = W.raycast(cam.pos.x, cam.pos.y, cam.pos.z, cam.dir.x, cam.dir.y, cam.dir.z, 260, _hit, false);
      if (t >= 0) {
        const d = Math.hypot(_hit.x - px, _hit.y - py, _hit.z - pz);
        if (relaxed) { if (d > 2.5 && d < 230) return setAnchor(_hit); }
        else if (d > 8 && d < 190 && _hit.y > py + 3) return setAnchor(_hit);
      }
      if (relaxed) return null;
      // fallback: fan of rays pitched upward around heading
      let yaw = cam.yaw;
      const hs = Math.hypot(b.vx, b.vz);
      if (hs > 10) yaw = Math.atan2(b.vx, b.vz);
      let best = null, bestScore = -1;
      const pitches = [45, 35, 55, 65, 28], yos = [0, 14, -14, 32, -32, 55, -55];
      for (let pi = 0; pi < pitches.length; pi++) {
        const pt = pitches[pi] * Math.PI / 180, cp = Math.cos(pt), sp = Math.sin(pt);
        for (let yi = 0; yi < yos.length; yi++) {
          const ya = yaw + yos[yi] * Math.PI / 180;
          const dx = Math.sin(ya) * cp, dz = Math.cos(ya) * cp;
          const tt = W.raycast(px, py, pz, dx, sp, dz, 170, _hit, false);
          if (tt < 14 || _hit.y < py + 6) continue;
          const sc = 1 / (1 + Math.abs(pitches[pi] - 45) / 30 + Math.abs(yos[yi]) / 40 + Math.abs(tt - 60) / 80);
          if (sc > bestScore) { bestScore = sc; best = setAnchor(_hit); }
        }
      }
      return best;
    };

    function handPos(out) { hero.root.updateMatrixWorld(true); return hero.hands[1].getWorldPosition(out); }

    // ---------------------------------------------------------------- actions
    function attachWeb() {
      const b = p.body;
      const a = p.findAnchor(false);
      handPos(_h);
      if (!a) {
        const cam = G.game.cam;
        _a.set(_h.x + cam.dir.x * 38, _h.y + cam.dir.y * 38, _h.z + cam.dir.z * 38);
        G.FX.beam(_h, _a, [2, 2.2, 3], 0.025, 0.25);
        G.Audio.play('whiff', 0.6);
        return false;
      }
      const w = p.web = { x: a.x, y: a.y, z: a.z, len: 0, shot: 0, check: 0, reel: false };
      w.len = Math.max(6, Math.hypot(b.x - a.x, b.y + CHEST - a.y, b.z - a.z));
      if (p.state === 'climb') { b.vx = a.x - b.x; b.vz = a.z - b.z; const m = Math.hypot(b.vx, b.vz) || 1; b.vx = b.vx / m * 4; b.vz = b.vz / m * 4; b.vy = 6; }
      else if (p.res.grounded) {
        b.vy = Math.max(b.vy, 9);
        const dx = a.x - b.x, dz = a.z - b.z, m = Math.hypot(dx, dz) || 1;
        b.vx += dx / m * 3.5; b.vz += dz / m * 3.5;
        p.res.grounded = false;
      }
      p.state = 'swing'; p.climbLost = 0;
      p.swingDist = 0; p.swingStartX = b.x; p.swingStartZ = b.z;
      p.stats.swings++;
      G.Audio.play('thwip', 0.8);
      G.FX.burst(a.x, a.y, a.z, 8, [1.6, 1.9, 2.4], 4, 0.5, 0.4, 2);
      return true;
    }

    function releaseWeb(boost) {
      if (!p.web) return;
      const b = p.body;
      p.web = null;
      if (p.state === 'swing') p.state = 'air';
      if (boost) {
        b.vy += 5.5;
        b.vx *= 1.05; b.vz *= 1.05;
        b.vy = Math.max(b.vy, 8);
        p.jumping = false;
      }
      const d = Math.hypot(b.x - p.swingStartX, b.z - p.swingStartZ);
      if (d > 25) G.game.addScore(Math.floor(d * 0.2), 'Swing ' + Math.round(d) + 'm');
      p.swingDist = 0;
    }
    p.releaseWeb = releaseWeb;

    function startZip() {
      const a = p.findAnchor(true);
      if (!a) { G.Audio.play('whiff', 0.5); return; }
      if (p.web) releaseWeb(false);
      p.zip = { x: a.x + a.nx * 1.0, y: a.y + a.ny * 1.0 - 1.0, z: a.z + a.nz * 1.0, t: 0, ax: a.x, ay: a.y, az: a.z };
      p.state = 'zip';
      G.Audio.play('zip', 0.9);
      G.FX.burst(a.x, a.y, a.z, 8, [1.6, 1.9, 2.4], 4, 0.5, 0.4, 2);
    }

    function startStrike() {
      if (p.strikeCd > 0) return;
      p.strikeCd = 0.38; p.strikeElapsed = 0; p.strikeSide ^= 1; p.strikeHit = false;
    }

    p.hurt = function (dmg, fx, fz) {
      if (p.dead || p.invuln > 0 || G.game.state !== 'playing') return;
      p.hp -= dmg; p.invuln = 0.25; p.sinceHurt = 0;
      hero.flashHit(1);
      G.Audio.play('hurt', 0.9);
      G.game.shake(0.25 + dmg * 0.02);
      if (G.HUD) G.HUD.damage();
      if (fx !== undefined) {
        const dx = p.body.x - fx, dz = p.body.z - fz, m = Math.hypot(dx, dz) || 1;
        p.body.vx += dx / m * 3; p.body.vz += dz / m * 3;
      }
      if (p.hp <= 0) { p.hp = 0; p.dead = true; p.web = null; p.zip = null; G.game.onPlayerDeath(); }
    };

    // ---------------------------------------------------------------- physics helpers
    function approach(b, tx, tz, step) {
      const dx = tx - b.vx, dz = tz - b.vz, d = Math.hypot(dx, dz);
      if (d <= step || d < 1e-5) { b.vx = tx; b.vz = tz; }
      else { b.vx += dx / d * step; b.vz += dz / d * step; }
    }

    function airControl(b, dt, wx, wz, has) {
      const hsp = Math.hypot(b.vx, b.vz);
      if (has) {
        const along = b.vx * wx + b.vz * wz;
        const add = G.clamp(RUN - along, 0, 18 * dt);
        b.vx += wx * add; b.vz += wz * add;
        if (hsp > 6) {
          const vx = b.vx / hsp, vz = b.vz / hsp, d = wx * vx + wz * vz;
          const px = wx - vx * d, pz = wz - vz * d;
          b.vx += px * 9 * dt; b.vz += pz * 9 * dt;
        }
      }
      const dg = 1 - 0.05 * dt; b.vx *= dg; b.vz *= dg;
    }

    function swingStep(dt, wx, wz, has, reel) {
      const b = p.body, w = p.web, r = p.res;
      const n = Math.max(1, Math.ceil(dt / 0.0085)), sdt = dt / n;
      for (let k = 0; k < n; k++) {
        b.vy -= GRAV * 0.95 * sdt;
        if (has) { b.vx += wx * 11 * sdt; b.vz += wz * 11 * sdt; }
        const oldL = w.len;
        if (reel) w.len = Math.max(6, w.len - 15 * sdt);
        W.moveBody(b, sdt, r);
        // rope constraint
        const cy = b.y + CHEST;
        let dx = b.x - w.x, dy = cy - w.y, dz = b.z - w.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > w.len) {
          const nx = dx / d, ny = dy / d, nz = dz / d;
          b.x = w.x + nx * w.len; b.y = w.y + ny * w.len - CHEST; b.z = w.z + nz * w.len;
          let vr = b.vx * nx + b.vy * ny + b.vz * nz;
          if (vr > 0) { b.vx -= nx * vr; b.vy -= ny * vr; b.vz -= nz * vr; vr = 0; }
          if (reel && w.len < oldL) {
            const f = Math.min(1.03, oldL / w.len);
            const tx = b.vx - nx * vr, ty = b.vy - ny * vr, tz = b.vz - nz * vr;
            b.vx = nx * vr + tx * f; b.vy = ny * vr + ty * f; b.vz = nz * vr + tz * f;
          }
        }
      }
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > MAXV) { const f = MAXV / sp; b.vx *= f; b.vy *= f; b.vz *= f; }
    }

    // ---------------------------------------------------------------- main update
    p.update = function (dt) {
      const I = G.Input, K = I.keys, cam = G.game.cam, b = p.body, r = p.res;
      if (p.dead) { hero.animate(dt, { hspeed: 0, grounded: true }); return; }

      p.coyote -= dt; p.jumpBuf -= dt; p.strikeCd -= dt; p.webCd -= dt; p.invuln -= dt; p.sinceHurt += dt;
      p.landT = Math.max(0, p.landT - dt * 4); p.climbCool -= dt; p.lockT -= dt;
      if (I.pressed.Space) p.jumpBuf = 0.14;

      // carry with moving platforms (cars)
      if (r.groundBox && r.groundBox.dynamic) { b.x += r.groundBox.dx; b.z += r.groundBox.dz; }

      const fw = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), rt = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      let wx = sy * fw - cy * rt, wz = cy * fw + sy * rt;
      const wl = Math.hypot(wx, wz), has = wl > 0.01;
      if (has) { wx /= wl; wz /= wl; }
      const run = !!(K.ShiftLeft || K.ShiftRight);

      // --- actions
      if (I.lmbDown && p.state !== 'zip') attachWeb();
      if ((I.lmbUp || (!I.lmb && p.state === 'swing')) && p.web) { releaseWeb(false); }
      if (I.rmbDown) startZip();
      if (I.pressed.KeyF) startStrike();
      if (I.pressed.KeyE && p.webCd <= 0) { p.webCd = 0.55; handPos(_h); G.Enemies.webShot(_h); }

      const wasGrounded = r.grounded;
      b.stepOK = wasGrounded;
      p.prevVy = b.vy;

      if (p.state === 'swing' && p.web) {
        const w = p.web;
        w.shot = Math.min(1, w.shot + dt / 0.07);
        if (I.pressed.Space) { releaseWeb(true); G.Audio.play('jump', 0.6); }
        else {
          swingStep(dt, wx, wz, has, run);
          p.swingDist = Math.hypot(b.x - p.swingStartX, b.z - p.swingStartZ);
          w.check -= dt;
          if (w.check <= 0) {
            w.check = 0.1;
            const dx = w.x - b.x, dy = w.y - (b.y + CHEST), dz = w.z - b.z, L = Math.hypot(dx, dy, dz);
            if (L > 2) {
              const t = W.raycast(b.x, b.y + CHEST, b.z, dx / L, dy / L, dz / L, L, _hit, false);
              if (t >= 0 && t < L - 1.2) { G.FX.burst(_hit.x, _hit.y, _hit.z, 5, [1.6, 1.9, 2.4], 3, 0.4, 0.3, 2); releaseWeb(false); }
            }
          }
          if (r.grounded && Math.hypot(b.vx, b.vz) < 4) { p.groundDrag = (p.groundDrag || 0) + dt; if (p.groundDrag > 0.4) { releaseWeb(false); p.groundDrag = 0; } } else p.groundDrag = 0;
        }
      } else if (p.state === 'zip' && p.zip) {
        const z = p.zip; z.t += dt;
        const dx = z.x - b.x, dy = z.y - b.y, dz = z.z - b.z, d = Math.hypot(dx, dy, dz);
        const sp = 52;
        if (d < 2.2 || z.t > 1.4) {
          p.zip = null; p.state = 'air';
          b.vy = Math.max(b.vy * 0.5, 5);
          const m = Math.hypot(b.vx, b.vz); if (m > 22) { b.vx *= 22 / m; b.vz *= 22 / m; }
        } else {
          b.vx = dx / d * sp; b.vy = dy / d * sp; b.vz = dz / d * sp;
          W.moveBody(b, dt, r);
          if (r.wall && !r.stepped && z.t > 0.15) { p.zip = null; p.state = 'air'; }
        }
        if (I.pressed.Space && p.zip) { p.zip = null; p.state = 'air'; b.vy = JUMP; }
      } else if (p.state === 'climb') {
        const n = p.climbN;
        const up = fw, side = rt;
        const sp = run ? 11 : 6.5;
        const tx = n.z, tz = -n.x;
        const tvx = tx * side * sp - n.x * 1.6, tvz = tz * side * sp - n.z * 1.6, tvy = up * sp;
        const k = Math.min(1, 18 * dt);
        b.vx += (tvx - b.vx) * k; b.vz += (tvz - b.vz) * k; b.vy += (tvy - b.vy) * k;
        b.stepOK = false;
        W.moveBody(b, dt, r);
        p.climbSpeed = Math.hypot(side, up) * sp;
        if (r.wall) {
          p.climbLost = 0;
          if (r.wallNx || r.wallNz) { n.x = r.wallNx; n.z = r.wallNz; }
        } else p.climbLost += dt;
        if (I.pressed.Space) {
          // wall jump
          b.vx = n.x * 9 + (has ? wx * 3 : 0); b.vz = n.z * 9 + (has ? wz * 3 : 0); b.vy = 12;
          p.state = 'air'; p.climbCool = 0.3; p.jumping = false; G.Audio.play('jump', 0.8);
        } else if (r.grounded && up < 0) {
          p.state = 'ground'; b.vx = n.x * 2; b.vz = n.z * 2;
        } else if (p.climbLost > 0.07) {
          if (up > 0) { b.vx = -n.x * 4.8; b.vz = -n.z * 4.8; b.vy = 7.5; p.climbCool = 0.35; G.Audio.play('jump', 0.5); }
          else { b.vx = 0; b.vz = 0; }
          p.state = 'air';
        }
      } else {
        // ----- ground / air
        const hsp = Math.hypot(b.vx, b.vz);
        if (wasGrounded) {
          const target = run ? RUN : WALK;
          const acc = has ? (hsp > target + 1 ? 18 : 62) : (hsp > target + 1 ? 14 : 52);
          approach(b, has ? wx * target : 0, has ? wz * target : 0, acc * dt);
        } else airControl(b, dt, wx, wz, has);

        if (p.jumpBuf > 0 && (wasGrounded || p.coyote > 0)) {
          b.vy = JUMP + Math.min(2, hsp * 0.08); p.coyote = 0; p.jumpBuf = 0; p.jumping = true; p.stats.jumps++;
          G.Audio.play('jump', 0.7);
          G.FX.burst(b.x, b.y + 0.1, b.z, 5, [0.9, 0.9, 1.0], 2, 0.5, 0.35, 0);
          b.stepOK = false;
        }
        if (p.jumping && !K.Space && b.vy > 3) { b.vy *= 0.55; p.jumping = false; }
        if (b.vy <= 0) p.jumping = false;
        b.vy = Math.max(TERM, b.vy - GRAV * dt);
        W.moveBody(b, dt, r);
        const sp3 = Math.hypot(b.vx, b.vy, b.vz);
        if (sp3 > MAXV) { const f = MAXV / sp3; b.vx *= f; b.vy *= f; b.vz *= f; }
        p.state = r.grounded ? 'ground' : 'air';
        if (r.grounded) p.coyote = 0.12;

        // wall contact -> climb
        if (r.wall && r.wallBox && !r.wallBox.dynamic && p.climbCool <= 0 && has && r.wallBox.maxY > b.y + 2.4) {
          const into = -(wx * r.wallNx + wz * r.wallNz);
          if (into > 0.55) {
            p.wallPress += dt;
            if (p.wallPress > (wasGrounded ? 0.12 : 0.02)) {
              p.state = 'climb'; p.climbN.x = r.wallNx; p.climbN.z = r.wallNz;
              b.vx = b.vy = b.vz = 0; p.wallPress = 0; p.climbLost = 0; p.stats.climbs++;
              G.FX.burst(b.x - r.wallNx * 0.4, b.y + 1.2, b.z - r.wallNz * 0.4, 5, [1, 1, 1.1], 2, 0.4, 0.3, 0);
            }
          } else p.wallPress = 0;
        } else p.wallPress = 0;
      }

      // landing
      const grounded = r.grounded && (p.state === 'ground' || p.state === 'swing' || p.state === 'climb');
      if (r.grounded && !p.prevGrounded && p.prevVy < -9 && p.state !== 'climb') {
        const imp = -p.prevVy;
        p.landT = G.clamp(imp / 30, 0.2, 1);
        G.Audio.play('land', G.clamp(imp / 35, 0.3, 1));
        G.FX.burst(b.x, b.y + 0.1, b.z, G.clamp(imp | 0, 6, 22), [0.85, 0.85, 0.95], 4 + imp * 0.1, 0.8, 0.5, 0);
        if (imp > 18) { b.vx *= 0.7; b.vz *= 0.7; G.game.shake(Math.min(0.5, imp * 0.01)); }
        if (imp > 46) p.hurt((imp - 46) * 1.3);
      }
      p.prevGrounded = r.grounded;

      // car collisions
      p.carHit -= dt;
      if (r.wallBox && r.wallBox.dynamic && p.carHit <= 0) {
        p.carHit = 1.0; p.hurt(6, r.wallBox.minX, r.wallBox.minZ);
        b.vy = Math.max(b.vy, 6); b.vx += r.wallBox.dx * 40; b.vz += r.wallBox.dz * 40;
      }

      // strike resolve
      if (p.strikeElapsed >= 0) {
        p.strikeElapsed += dt;
        if (!p.strikeHit && p.strikeElapsed >= 0.1) {
          p.strikeHit = true;
          const n = G.Enemies.meleeHit(p);
          G.Audio.play(n ? 'punch' : 'whiff', n ? 1 : 0.7);
        }
        if (p.strikeElapsed > 0.34) p.strikeElapsed = -1;
      }

      // regen
      if (p.sinceHurt > 6 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 2.5 * dt);

      // fell out of the world safety
      if (b.y < -20 || !isFinite(b.x + b.y + b.z)) { p.reset(G.game.city.spawn.x, G.game.city.spawn.y, G.game.city.spawn.z, 0); }

      p.hspeed = Math.hypot(b.vx, b.vz); p.speed = Math.hypot(b.vx, b.vy, b.vz);

      // ---- visuals
      let faceYaw = p.yaw;
      if (p.state === 'climb') faceYaw = Math.atan2(-p.climbN.x, -p.climbN.z);
      else if (p.lockT > 0) faceYaw = p.lockYaw;
      else if (p.hspeed > 1.2) faceYaw = Math.atan2(b.vx, b.vz);
      p.yaw = G.dampAngle(p.yaw, faceYaw, p.state === 'swing' ? 6 : (p.lockT > 0 ? 24 : 14), dt);
      hero.root.position.set(b.x, b.y, b.z);
      hero.root.rotation.y = p.yaw;

      const as = { hspeed: p.hspeed, vy: b.vy, grounded: r.grounded && p.state !== 'swing' && p.state !== 'zip', climbing: p.state === 'climb', swinging: p.state === 'swing' || p.state === 'zip',
        climbSpeed: (p.climbSpeed || 0) * (p.state === 'climb' ? 1 : 0), landT: p.landT, strikeT: p.strikeElapsed >= 0 ? p.strikeElapsed / 0.34 : 0, strikeSide: p.strikeSide };
      if (p.web || p.zip) {
        const tgt = p.web || p.zip, ax = p.web ? tgt.x : tgt.ax, ay = p.web ? tgt.y : tgt.ay, az = p.web ? tgt.z : tgt.az;
        let vx = ax - b.x, vy = ay - (b.y + 1.5), vz = az - b.z;
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        const lx = vx * c - vz * s, lz = vx * s + vz * c, m = Math.hypot(lx, vy, lz) || 1;
        if (!p._aim) p._aim = new T.Vector3();
        p._aim.set(lx / m, vy / m, lz / m);
        as.aimLocal = p._aim;
        const sv = Math.hypot(b.vx, b.vz);
        as.roll = G.clamp((b.vx * Math.cos(p.yaw) - b.vz * Math.sin(p.yaw)) * 0.0, -0.2, 0.2);
      }
      hero.animate(dt, as);

      // web line
      if (p.web || p.zip) {
        handPos(_h);
        const tgt = p.web || p.zip, ax = p.web ? tgt.x : tgt.ax, ay = p.web ? tgt.y : tgt.ay, az = p.web ? tgt.z : tgt.az;
        const f = p.web ? p.web.shot : Math.min(1, p.zip.t / 0.06);
        _a.set(_h.x + (ax - _h.x) * f, _h.y + (ay - _h.y) * f, _h.z + (az - _h.z) * f);
        G.FX.setLine(webLine, _h, _a, 0.03);
        // faint secondary strand for a richer look
        _h.y += 0.04; _a.y += 0.04;
        G.FX.setLine(webLine2, _h, _a, 0.012);
      } else { webLine.visible = false; webLine2.visible = false; }

      // trail / dust particles
      if (p.speed > 24 && p.state !== 'climb') {
        G.FX.emit(b.x + (Math.random() - 0.5) * 0.4, b.y + 1.0 + (Math.random() - 0.5) * 0.6, b.z + (Math.random() - 0.5) * 0.4, -b.vx * 0.05, -b.vy * 0.05, -b.vz * 0.05, 0.5, 0.9, 1.6, 0.5, 0.45, 0.4, 0, 2);
      }
      if (r.grounded && p.hspeed > 8) {
        p.dustT -= dt;
        if (p.dustT <= 0) { p.dustT = 0.09; G.FX.emit(b.x, b.y + 0.05, b.z, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 0.7, 0.7, 0.8, 0.35, 0.7, 0.5, -0.5, 1, 1.5); }
      }

      // crosshair preview
      p.previewT -= dt;
      if (p.previewT <= 0) {
        p.previewT = 0.12;
        p.previewAnchor = p.findAnchor(false);
        p.canWeb = !!p.previewAnchor;
      }
    };

    return p;
  };
})();
