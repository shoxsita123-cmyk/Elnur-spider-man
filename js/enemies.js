/* Enemies: thugs, drones and the boss, plus projectiles */
(function () {
  'use strict';
  const G = window.G, T = THREE, W = G.World;

  const E = (G.Enemies = { list: [], kills: 0 });
  let scene, bulletMeshes = [];
  const bullets = [];
  const _v = new T.Vector3(), _m = new T.Vector3(), _hit = {};
  const BULLET_COL = { thug: [3.2, 1.6, 0.3], drone: [3.4, 0.4, 0.5], boss: [3.4, 0.5, 2.5] };

  E.init = function (sc) {
    scene = sc;
    const geo = new T.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 64; i++) {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial());
      m.visible = false; sc.add(m);
      bulletMeshes.push(m);
      bullets.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, dmg: 0, mesh: m, kind: 'thug' });
    }
  };

  E.clear = function () {
    for (const e of E.list) scene.remove(e.model.root);
    E.list.length = 0;
    for (const b of bullets) { b.active = false; b.mesh.visible = false; }
  };

  E.alive = function (type) { let n = 0; for (const e of E.list) if (!e.dead && (!type || e.type === type)) n++; return n; };

  E.spawn = function (type, x, y, z, opts) {
    opts = opts || {};
    const isDrone = type === 'drone';
    const scale = type === 'boss' ? 1.8 : 1;
    const model = isDrone ? G.buildDrone() : G.buildHumanoid(type === 'boss' ? 'boss' : 'thug', scale);
    const hp = (type === 'boss' ? 520 : isDrone ? 45 : 70) * (opts.hpMul || 1);
    const e = {
      type, model, hp, maxHp: hp, dead: false, deadT: 0, stun: 0, flashT: 0, alert: !!opts.alert, tag: opts.tag || null,
      body: { x, y, z, vx: 0, vy: 0, vz: 0, hw: isDrone ? 0.5 : 0.4 * scale, h: isDrone ? 1.0 : 1.85 * scale, ignoreDyn: true, stepOK: true },
      res: W.newResult(), home: { x, z }, shootCd: 0.8 + Math.random() * 1.5, meleeCd: 0, contactCd: 0, los: false, losT: Math.random() * 0.25,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random() * 2, wanderT: 0, wx: 0, wz: 0, yaw: Math.random() * 6.28, ang: Math.random() * 6.28,
      orbitR: 11 + Math.random() * 6, hoverH: 4 + Math.random() * 5, orbitSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.3),
      slamT: -1, slamCd: 5, strikeT: 0, jumpCd: 0, radius: isDrone ? 0.8 : 0.8 * scale, centerY: isDrone ? 0.5 : 0.95 * scale,
      aim: new T.Vector3(0, -1, 0), score: type === 'boss' ? 2500 : isDrone ? 150 : 100
    };
    model.root.position.set(x, y, z);
    scene.add(model.root);
    E.list.push(e);
    return e;
  };

  // --------------------------------------------------------------- bullets
  function fire(kind, ox, oy, oz, tx, ty, tz, speed, dmg, spread) {
    const b = bullets.find((q) => !q.active);
    if (!b) return;
    let dx = tx - ox + (Math.random() - 0.5) * spread, dy = ty - oy + (Math.random() - 0.5) * spread, dz = tz - oz + (Math.random() - 0.5) * spread;
    const m = Math.hypot(dx, dy, dz) || 1;
    b.active = true; b.x = ox; b.y = oy; b.z = oz; b.vx = dx / m * speed; b.vy = dy / m * speed; b.vz = dz / m * speed;
    b.life = 4; b.dmg = dmg; b.kind = kind;
    const c = BULLET_COL[kind] || BULLET_COL.thug;
    b.mesh.material.color.setRGB(c[0], c[1], c[2]);
    b.mesh.visible = true; b.mesh.position.set(ox, oy, oz);
    b.mesh.scale.setScalar(kind === 'boss' ? 1.6 : 1);
    G.Audio.play(kind === 'drone' || kind === 'boss' ? 'plasma' : 'shoot', 0.7);
  }

  function updateBullets(dt, P) {
    const pb = P.body;
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz), L = sp * dt;
      let dead = b.life <= 0;
      if (!dead && L > 0) {
        const t = W.raycast(b.x, b.y, b.z, b.vx / sp, b.vy / sp, b.vz / sp, L, _hit, true);
        if (t >= 0) { G.FX.burst(_hit.x, _hit.y, _hit.z, 6, BULLET_COL[b.kind] || [3, 1.5, 0.3], 5, 0.35, 0.3, 4); dead = true; }
        else if (ny < 0) { G.FX.burst(nx, 0.05, nz, 5, [3, 1.5, 0.3], 4, 0.3, 0.25, 4); dead = true; }
      }
      if (!dead && !P.dead) {
        // closest point on segment to player centre
        const cx = pb.x, cy = pb.y + 0.95, cz = pb.z;
        const sx = nx - b.x, sy = ny - b.y, sz = nz - b.z, l2 = sx * sx + sy * sy + sz * sz || 1;
        let u = ((cx - b.x) * sx + (cy - b.y) * sy + (cz - b.z) * sz) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = b.x + sx * u - cx, qy = b.y + sy * u - cy, qz = b.z + sz * u - cz;
        if (qx * qx + qy * qy + qz * qz < 1.0) {
          P.hurt(b.dmg, b.x - b.vx, b.z - b.vz);
          G.FX.burst(cx, cy, cz, 8, [3, 0.8, 0.4], 5, 0.4, 0.3, 3);
          dead = true;
        }
      }
      if (dead) { b.active = false; b.mesh.visible = false; continue; }
      b.x = nx; b.y = ny; b.z = nz;
      b.mesh.position.set(nx, ny, nz);
      const c = BULLET_COL[b.kind] || BULLET_COL.thug;
      G.FX.emit(nx, ny, nz, 0, 0, 0, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.7, 0.4, 0.18, 0, 0);
    }
  }

  // --------------------------------------------------------------- damage
  function damage(e, amount, fx, fz, kb, label) {
    if (e.dead) return;
    e.hp -= amount; e.model.flashHit(1);
    const c = center(e, _v);
    G.HUD.popup(c.x, c.y + 0.9, c.z, Math.round(amount) + (label ? ' ' + label : ''), label ? '#ffd24a' : '#ffffff');
    G.FX.burst(c.x, c.y, c.z, 8, [3, 2.6, 1.6], 5, 0.4, 0.25, 6);
    G.Audio.play('hit', 0.9);
    G.game.registerHit();
    if (kb && e.type !== 'boss') {
      const dx = e.body.x - fx, dz = e.body.z - fz, m = Math.hypot(dx, dz) || 1;
      e.body.vx += dx / m * kb; e.body.vz += dz / m * kb; e.body.vy = Math.max(e.body.vy, kb * 0.35);
      if (e.type !== 'drone') e.stun = Math.max(e.stun, 0.35);
    }
    if (e.hp <= 0) kill(e);
  }
  E.damage = damage;

  function center(e, out) { return out.set(e.body.x, e.body.y + e.centerY, e.body.z); }

  function kill(e) {
    e.dead = true; e.deadT = 0; E.kills++;
    const c = center(e, _m);
    if (e.type === 'drone') {
      e.model.root.visible = false;
      G.FX.burst(c.x, c.y, c.z, 36, [3.4, 1.6, 0.4], 14, 0.9, 0.7, 6);
      G.FX.burst(c.x, c.y, c.z, 14, [3, 3, 3], 8, 1.2, 0.5, 2);
      G.Audio.play('explode', 0.8);
    } else {
      G.FX.burst(c.x, c.y, c.z, e.type === 'boss' ? 60 : 16, [3, 1.2, 0.3], e.type === 'boss' ? 16 : 8, 0.8, 0.6, 5);
      G.Audio.play(e.type === 'boss' ? 'explode' : 'punch', 1);
    }
    e.model.shell.visible = false;
    G.game.addKill(e);
    if (G.Missions) G.Missions.onKill(e);
    if (G.Pickups && (e.type === 'boss' || Math.random() < 0.28)) G.Pickups.spawn(e.body.x, e.body.y + 1, e.body.z);
  }

  // --------------------------------------------------------------- player attacks
  E.meleeHit = function (P) {
    const b = P.body, air = !P.res.grounded;
    const ox = b.x, oy = b.y + 1.0, oz = b.z;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    let target = null, td = 1e9;
    for (const e of E.list) {
      if (e.dead) continue;
      const c = center(e, _v), dx = c.x - ox, dy = c.y - oy, dz = c.z - oz;
      const d = Math.hypot(dx, dy, dz) - e.radius * 0.5;
      if (d < 4.6 && d < td) { td = d; target = e; }
    }
    let n = 0;
    if (target) {
      const dx = target.body.x - ox, dz = target.body.z - oz, m = Math.hypot(dx, dz) || 1;
      P.lockYaw = Math.atan2(dx, dz); P.lockT = 0.3;
      for (const e of E.list) {
        if (e.dead) continue;
        const c = center(e, _v), ex = c.x - ox, ey = c.y - oy, ez = c.z - oz;
        const d = Math.hypot(ex, ey, ez) - e.radius * 0.5;
        const dot = (ex * Math.sin(P.lockYaw) + ez * Math.cos(P.lockYaw)) / (Math.hypot(ex, ez) || 1);
        if (d < 3.8 && dot > 0.1) {
          damage(e, air ? 38 : 30, ox, oz, 9, null); n++;
        }
      }
      if (n) G.game.hitStop(0.06);
    }
    return n;
  };

  E.webShot = function (hand) {
    const cam = G.game.cam, P = G.game.player;
    let best = null, bestScore = 1e9;
    for (const e of E.list) {
      if (e.dead) continue;
      const c = center(e, _v);
      const vx = c.x - cam.pos.x, vy = c.y - cam.pos.y, vz = c.z - cam.pos.z;
      const t = vx * cam.dir.x + vy * cam.dir.y + vz * cam.dir.z;
      if (t < 3 || t > 90) continue;
      const px = vx - cam.dir.x * t, py = vy - cam.dir.y * t, pz = vz - cam.dir.z * t;
      const perp = Math.hypot(px, py, pz);
      if (perp > e.radius + 0.7 + t * 0.035) continue;
      if (W.segmentBlocked(hand.x, hand.y, hand.z, c.x, c.y, c.z)) continue;
      if (perp < bestScore) { bestScore = perp; best = e; }
    }
    G.Audio.play('thwip', 0.9);
    if (best) {
      const c = center(best, _m);
      G.FX.beam(hand, c, [2.4, 2.6, 3.2], 0.05, 0.3);
      best.stun = best.type === 'boss' ? 0.6 : 1.8;
      damage(best, 12, P.body.x, P.body.z, 0, 'WEB');
    } else {
      _m.set(hand.x + cam.dir.x * 45, hand.y + cam.dir.y * 45, hand.z + cam.dir.z * 45);
      const t = W.raycast(cam.pos.x, cam.pos.y, cam.pos.z, cam.dir.x, cam.dir.y, cam.dir.z, 45, _hit, false);
      if (t >= 0) _m.set(_hit.x, _hit.y, _hit.z);
      G.FX.beam(hand, _m, [2.4, 2.6, 3.2], 0.04, 0.25);
    }
  };

  // --------------------------------------------------------------- AI
  function approachV(b, tx, tz, step) {
    const dx = tx - b.vx, dz = tz - b.vz, d = Math.hypot(dx, dz);
    if (d <= step || d < 1e-5) { b.vx = tx; b.vz = tz; } else { b.vx += dx / d * step; b.vz += dz / d * step; }
  }

  function updateEnemy(e, dt, P) {
    const b = e.body, pb = P.body;
    const pcx = pb.x, pcy = pb.y + 1.1, pcz = pb.z;
    const dx = pcx - b.x, dz = pcz - b.z;
    const dist2 = Math.hypot(dx, dz), dist = Math.hypot(dx, pcy - (b.y + e.centerY), dz);

    if (e.dead) {
      e.deadT += dt;
      if (e.type !== 'drone') {
        const f = G.clamp(e.deadT / 0.4, 0, 1);
        e.model.root.rotation.x = -f * 1.45;
        e.model.root.position.y = b.y + (e.deadT > 1.6 ? -(e.deadT - 1.6) * 1.2 : 0);
        e.model.animate(dt, { hspeed: 0, grounded: true });
      }
      return;
    }
    e.contactCd -= dt; e.meleeCd -= dt; e.jumpCd -= dt; e.flashT -= dt;
    if (e.stun > 0) e.stun -= dt;
    e.model.shell.visible = e.stun > 0.05 && e.type !== 'boss' ? true : e.stun > 0.05;

    // visibility / sleep
    const far = dist > 190;
    e.model.root.visible = !far;
    if (far && !e.alert) return;
    if (e.type !== 'drone') e.model.setShadow(dist < 70);

    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = 0.25;
      const c = center(e, _v);
      e.los = dist < 100 && !W.segmentBlocked(c.x, c.y + 0.4, c.z, pcx, pcy, pcz);
    }
    const aggro = e.alert ? dist < 160 : dist < 60;
    let engaged = aggro && e.los && !P.dead;

    // swing-kick: hit by a fast moving player
    if (P.speed > 19 && P.state !== 'climb' && e.contactCd <= 0 && dist < 2.0 + e.radius * 0.6) {
      e.contactCd = 0.7;
      damage(e, Math.min(70, 25 + P.speed), pb.x - pb.vx, pb.z - pb.vz, 11, 'KICK');
      G.game.hitStop(0.07);
      if (e.dead) return;
    }

    if (e.type === 'drone') {
      e.ang += dt * e.orbitSpeed;
      let tx, ty, tz;
      if (aggro && !P.dead) {
        tx = pcx + Math.cos(e.ang) * e.orbitR; ty = pb.y + e.hoverH; tz = pcz + Math.sin(e.ang) * e.orbitR;
      } else { tx = e.home.x + Math.cos(e.ang) * 6; ty = b.y; tz = e.home.z + Math.sin(e.ang) * 6; }
      if (e.stun > 0) { b.vy -= 22 * dt; b.vx *= 0.97; b.vz *= 0.97; }
      else {
        let vx = (tx - b.x) * 1.3, vy = (ty - b.y) * 1.3, vz = (tz - b.z) * 1.3;
        const m = Math.hypot(vx, vy, vz), mx = aggro ? 16 : 5;
        if (m > mx) { vx *= mx / m; vy *= mx / m; vz *= mx / m; }
        const k = Math.min(1, 3 * dt);
        b.vx += (vx - b.vx) * k; b.vy += (vy - b.vy) * k; b.vz += (vz - b.vz) * k;
      }
      W.moveBody(b, dt, e.res);
      if (b.y < 2.2) { b.y = 2.2; if (b.vy < 0) b.vy = 0; }
      e.yaw = Math.atan2(dx, dz);
      e.shootCd -= dt;
      if (engaged && e.stun <= 0 && e.shootCd <= 0 && dist < 70) {
        e.shootCd = 1.5 + Math.random() * 1.1;
        const c = center(e, _v), lead = dist / 34 * 0.5;
        fire('drone', c.x, c.y, c.z, pcx + pb.vx * lead, pcy + pb.vy * lead * 0.5, pcz + pb.vz * lead, 34, 8, dist * 0.03);
      }
      e.model.root.position.set(b.x, b.y, b.z);
      e.model.root.rotation.y = e.yaw;
      e.model.animate(dt, { hspeed: Math.hypot(b.vx, b.vz) });
      return;
    }

    // ---- humanoid
    let wishX = 0, wishZ = 0, speedMul = 1;
    const boss = e.type === 'boss';
    if (e.stun > 0) { /* stunned: no actions */ }
    else if (engaged) {
      e.yaw = G.dampAngle(e.yaw, Math.atan2(dx, dz), 10, dt);
      const nx = dx / (dist2 || 1), nz = dz / (dist2 || 1);
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = 1.5 + Math.random() * 2.5; e.strafe *= -1; }
      const lo = boss ? 8 : 10, hi = boss ? 18 : 22;
      if (dist2 > hi) { wishX = nx; wishZ = nz; speedMul = boss ? 1.1 : 1; }
      else if (dist2 < lo) { wishX = -nx * 0.7; wishZ = -nz * 0.7; }
      else { wishX = -nz * e.strafe * 0.6; wishZ = nx * e.strafe * 0.6; }
      if (dist2 < 2.6 && e.meleeCd <= 0) {
        e.meleeCd = 1.1; e.strikeT = 0.0001; P.hurt(boss ? 16 : 9, b.x, b.z);
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 75 && Math.abs(pb.y - b.y) < 60) {
        e.shootCd = boss ? 1.8 : 1.1 + Math.random() * 1.0;
        e.model.root.updateMatrixWorld(true);
        e.model.worldMuzzle(_m);
        const lead = dist / 55 * 0.55;
        const tx = pcx + pb.vx * lead, ty = pcy + pb.vy * lead * 0.4, tz = pcz + pb.vz * lead;
        if (boss) {
          for (let k = -2; k <= 2; k++) { const a = k * 0.13, cs = Math.cos(a), sn = Math.sin(a); const rx = tx - _m.x, rz = tz - _m.z; fire('boss', _m.x, _m.y, _m.z, _m.x + rx * cs - rz * sn, ty, _m.z + rx * sn + rz * cs, 40, 9, 1); }
        } else fire('thug', _m.x, _m.y, _m.z, tx, ty, tz, 55, 7, dist * 0.045);
      }
      // boss slam
      if (boss) {
        e.slamCd -= dt;
        if (e.slamT < 0 && e.slamCd <= 0 && dist2 < 16) { e.slamT = 0.9; e.slamCd = 6; G.HUD.popup(b.x, b.y + 4, b.z, 'SLAM!', '#ff5a5a'); }
        if (e.slamT >= 0) {
          e.slamT -= dt;
          const rr = 12 * (1 - e.slamT / 0.9);
          for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28; G.FX.emit(b.x + Math.cos(a) * rr, b.y + 0.15, b.z + Math.sin(a) * rr, 0, 1.5, 0, 3, 0.6, 0.4, 0.9, 1.0, 0.4, 0, 0); }
          if (e.slamT < 0) {
            G.FX.burst(b.x, b.y + 0.3, b.z, 40, [3, 1.2, 0.5], 14, 1, 0.6, 0);
            G.Audio.play('explode', 0.9); G.game.shake(0.6);
            if (dist2 < 13 && pb.y - b.y < 2.2) { P.hurt(20, b.x, b.z); pb.vy = Math.max(pb.vy, 10); }
            e.slamT = -1;
          }
        }
      }
    } else if (aggro && !P.dead && dist < 90) {
      // chase to regain line of sight
      e.yaw = G.dampAngle(e.yaw, Math.atan2(dx, dz), 6, dt);
      wishX = dx / (dist2 || 1); wishZ = dz / (dist2 || 1);
    } else {
      // idle wander around home
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + Math.random() * 3;
        if (Math.random() < 0.4) { e.wx = 0; e.wz = 0; }
        else { const a = Math.random() * 6.28; e.wx = Math.cos(a); e.wz = Math.sin(a); }
        const hx = e.home.x - b.x, hz = e.home.z - b.z;
        if (Math.hypot(hx, hz) > 9) { const m = Math.hypot(hx, hz); e.wx = hx / m; e.wz = hz / m; }
      }
      wishX = e.wx * 0.5; wishZ = e.wz * 0.5;
      if (wishX || wishZ) e.yaw = G.dampAngle(e.yaw, Math.atan2(wishX, wishZ), 6, dt);
    }

    // roof edge safety
    if ((wishX || wishZ) && b.y > 1.5) {
      const m = Math.hypot(wishX, wishZ);
      const t = W.raycast(b.x + wishX / m * 1.8, b.y + 0.6, b.z + wishZ / m * 1.8, 0, -1, 0, 3, null, false);
      if (t < 0) { wishX = 0; wishZ = 0; e.strafe *= -1; }
    }
    const sp = (boss ? 5.5 : 6) * speedMul;
    const grounded = e.res.grounded;
    approachV(b, wishX * sp, wishZ * sp, (grounded ? 40 : 6) * dt);
    b.vy = Math.max(-60, b.vy - 30 * dt);
    b.stepOK = grounded;
    W.moveBody(b, dt, e.res);
    if (e.res.wall && e.res.grounded && e.jumpCd <= 0 && (wishX || wishZ)) { b.vy = 8.5; e.jumpCd = 1.2; }

    // visuals
    e.model.root.position.set(b.x, b.y, b.z);
    e.model.root.rotation.y = e.yaw;
    if (e.strikeT > 0) { e.strikeT += dt / 0.34; if (e.strikeT >= 1) e.strikeT = 0; }
    const as = { hspeed: Math.hypot(b.vx, b.vz), grounded: e.res.grounded, vy: b.vy, strikeT: e.strikeT, strikeSide: 1 };
    if (engaged && e.stun <= 0) {
      const sc = boss ? 1.8 : 1;
      const vx = pcx - b.x, vy = pcy - (b.y + 1.45 * sc), vz = pcz - b.z;
      const c = Math.cos(e.yaw), s = Math.sin(e.yaw), lx = vx * c - vz * s, lz = vx * s + vz * c, m = Math.hypot(lx, vy, lz) || 1;
      e.aim.set(lx / m, vy / m, lz / m);
      as.aiming = true; as.aimLocal = e.aim;
    }
    e.model.animate(dt, as);
  }

  E.update = function (dt) {
    const P = G.game.player;
    for (let i = E.list.length - 1; i >= 0; i--) {
      const e = E.list[i];
      updateEnemy(e, dt, P);
      if (e.dead && e.deadT > 2.6) { scene.remove(e.model.root); E.list.splice(i, 1); }
    }
    updateBullets(dt, P);
  };
})();
