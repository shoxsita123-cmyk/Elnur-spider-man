/* Missions (reach, defeat, rings, rescue, boss) and health pickups */
(function () {
  'use strict';
  const G = window.G, T = THREE, W = G.World;
  const { PITCH } = G.CITY;

  let scene;
  const M = (G.Missions = { index: -1, cur: null, wait: 0, completed: 0 });
  const Pk = (G.Pickups = { list: [] });

  // ------------------------------------------------------------ pickups
  let pkGeo, pkMat;
  Pk.init = function (sc) {
    pkGeo = new T.OctahedronGeometry(0.45, 0);
    pkMat = new T.MeshBasicMaterial(); pkMat.color.setRGB(0.5, 3.0, 1.2);
  };
  Pk.clear = function () { for (const p of Pk.list) scene.remove(p.mesh); Pk.list.length = 0; };
  Pk.spawn = function (x, y, z) {
    if (Pk.list.length > 24) { const o = Pk.list.shift(); scene.remove(o.mesh); }
    const m = new T.Mesh(pkGeo, pkMat);
    m.position.set(x, y, z); m.scale.set(1, 1.4, 1); scene.add(m);
    Pk.list.push({ mesh: m, x, y, z, t: Math.random() * 6 });
  };
  Pk.update = function (dt, P) {
    const b = P.body;
    for (let i = Pk.list.length - 1; i >= 0; i--) {
      const p = Pk.list[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2.5;
      p.mesh.position.y = p.y + Math.sin(p.t * 3) * 0.25;
      if (Math.abs(p.x - b.x) < 2.3 && Math.abs(p.z - b.z) < 2.3 && p.y > b.y - 1 && p.y < b.y + 3.2) {
        if (P.hp < P.maxHp) {
          P.hp = Math.min(P.maxHp, P.hp + 25);
          G.HUD.popup(p.x, p.y + 0.5, p.z, '+25 HP', '#5dff9c');
          G.Audio.play('pickup', 0.8);
          G.FX.burst(p.x, p.y, p.z, 14, [0.5, 3, 1.2], 5, 0.5, 0.5, 0);
          scene.remove(p.mesh); Pk.list.splice(i, 1);
        }
      }
    }
  };

  // ------------------------------------------------------------ beams
  const beamGeo = new T.CylinderGeometry(1, 1, 1, 14, 1, true);
  function makeBeam(rgb, radius, height) {
    const mat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
    const m = new T.Mesh(beamGeo, mat);
    m.scale.set(radius, height, radius); m.frustumCulled = false; m.renderOrder = 4;
    const ring = new T.Mesh(new T.TorusGeometry(1, 0.06, 6, 28), new T.MeshBasicMaterial({ color: 0xffffff }));
    ring.material.color.setRGB(rgb[0] * 2, rgb[1] * 2, rgb[2] * 2);
    ring.rotation.x = Math.PI / 2; ring.scale.set(radius * 2.2, radius * 2.2, radius * 2.2);
    const g = new T.Group(); g.add(m); m.position.y = height / 2; g.add(ring); g.userData.ring = ring;
    scene.add(g);
    return g;
  }

  const COL = { cyan: [0.3, 1.4, 1.8], red: [2.0, 0.3, 0.3], gold: [2.2, 1.5, 0.3], green: [0.4, 2.0, 0.8], violet: [1.4, 0.5, 2.2] };

  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  // ------------------------------------------------------------ mission factories
  function pickRoof(city, rnd, from, minD, maxD, minH, maxH, avoid) {
    let c = city.roofs.filter((b) => b.h >= minH && b.h <= maxH && !(b.i === 0 && b.j === 0));
    const f = c.filter((b) => { const d = Math.hypot(b.x - from.x, b.z - from.z); return d >= minD && d <= maxD && (!avoid || avoid.every((a) => Math.hypot(a.x - b.x, a.z - b.z) > 110)); });
    if (f.length) c = f;
    return c[(rnd() * c.length) | 0];
  }
  function pickBlock(rnd, from, minD, maxD) {
    for (let t = 0; t < 40; t++) {
      const i = ((rnd() * 9) | 0) - 4, j = ((rnd() * 9) | 0) - 4;
      const d = Math.hypot(i * PITCH - from.x, j * PITCH - from.z);
      if (d >= minD && d <= maxD && !(i === 0 && j === 0)) return { i, j };
    }
    return { i: 2, j: 2 };
  }

  function reachMission(ctx, difficulty) {
    const b = pickRoof(ctx.city, ctx.rnd, ctx.from, 240, 420, 70, 150);
    const tgt = { x: b.cx, y: b.h, z: b.cz };
    let beam;
    return {
      type: 'reach', title: 'First Swing', brief: 'Swing across the city to the glowing beacon on the rooftop.',
      objective: () => 'Reach the rooftop beacon', progress: () => Math.round(Math.hypot(tgt.x - G.game.player.body.x, tgt.z - G.game.player.body.z)) + ' m',
      reward: 600,
      start() { beam = makeBeam(COL.cyan, 2.2, 420); beam.position.set(tgt.x, tgt.y, tgt.z); },
      update(dt) {
        beam.userData.ring.rotation.z += dt * 2; beam.userData.ring.position.y = 1.5 + Math.sin(performance.now() / 400) * 0.5;
        const p = G.game.player.body;
        if (Math.hypot(p.x - tgt.x, p.z - tgt.z) < 6 && Math.abs(p.y - tgt.y) < 5) return 'done';
      },
      markers: () => [{ x: tgt.x, y: tgt.y + 3, z: tgt.z, color: '#4fe9ff', label: 'BEACON' }],
      cleanup() { scene.remove(beam); }
    };
  }

  function defeatMission(ctx, n, kind, titleOverride) {
    const blk = pickBlock(ctx.rnd, ctx.from, 130, 330);
    const ox = blk.i * PITCH, oz = blk.j * PITCH;
    const drones = kind === 'drone';
    let enemies = [], beam, spawned = 0;
    return {
      type: 'defeat', title: titleOverride || (drones ? 'Drone Swarm' : 'Street Patrol'),
      brief: drones ? 'Hostile drones are circling downtown. Take them all out!' : 'A gang is terrorising the district. Clear them out!',
      objective: () => (drones ? 'Destroy the drones' : 'Defeat the gang'), progress: () => (spawned - G.Enemies.alive(kind || 'thug')) + '/' + spawned,
      reward: 800 + n * 60,
      start() {
        for (let k = 0; k < n; k++) {
          if (drones) {
            enemies.push(G.Enemies.spawn('drone', ox + (ctx.rnd() - 0.5) * 50, 14 + ctx.rnd() * 22, oz + (ctx.rnd() - 0.5) * 50, { alert: false }));
          } else {
            const s = G.City.sidewalkSpot(ctx.rnd, blk.i, blk.j);
            enemies.push(G.Enemies.spawn('thug', s.x, s.y, s.z, {}));
          }
        }
        spawned = enemies.length;
        beam = makeBeam(COL.red, 3, 300); beam.position.set(ox, 0, oz);
      },
      update(dt) {
        beam.userData.ring.rotation.z += dt * 2;
        const alive = enemies.filter((e) => !e.dead);
        if (alive.length === 0) return 'done';
        let cx = 0, cz = 0; for (const e of alive) { cx += e.body.x; cz += e.body.z; }
        cx /= alive.length; cz /= alive.length;
        beam.position.x += (cx - beam.position.x) * Math.min(1, dt * 2); beam.position.z += (cz - beam.position.z) * Math.min(1, dt * 2);
        beam.position.y = 0;
        this._alive = alive;
      },
      markers() { return (this._alive || enemies).filter((e) => !e.dead).map((e) => ({ x: e.body.x, y: e.body.y + 2, z: e.body.z, color: '#ff5a5a', label: '', small: true })); },
      cleanup() { scene.remove(beam); }
    };
  }

  function ringsMission(ctx, n) {
    const P = G.game.player.body, rnd = ctx.rnd;
    const axis = rnd() < 0.5 ? 'x' : 'z';
    const along = axis === 'x' ? P.x : P.z, across = axis === 'x' ? P.z : P.x;
    let k = Math.round(across / PITCH - 0.5); k = G.clamp(k, -5, 4);
    const c = (k + 0.5) * PITCH;
    const dir = along > 0 ? -1 : 1;
    const rings = [];
    const step = 46;
    const startA = G.clamp(along + dir * 60, -330, 330) - (dir > 0 ? 0 : 0);
    let idx = 0, done = 0, timeLeft = 0, total = n * 7.5 + 22;
    return {
      type: 'rings', title: 'Sky Run', brief: 'Fly through the glowing rings along the avenue before time runs out!',
      objective: () => 'Fly through the rings', progress: () => done + '/' + n, reward: 900 + n * 40,
      timer: () => timeLeft,
      start() {
        timeLeft = total;
        for (let q = 0; q < n; q++) {
          const a = G.clamp(startA + dir * step * q, -440, 440);
          const y = 34 + Math.sin(q * 0.9) * 16 + ctx.rnd() * 8, lat = Math.sin(q * 1.7) * 5;
          const pos = axis === 'x' ? new T.Vector3(a, y, c + lat) : new T.Vector3(c + lat, y, a);
          const mesh = new T.Mesh(new T.TorusGeometry(4.2, 0.35, 8, 28), new T.MeshBasicMaterial());
          mesh.material.color.setRGB(0.4, 0.5, 0.7);
          mesh.position.copy(pos);
          if (axis === 'x') mesh.rotation.y = Math.PI / 2;
          scene.add(mesh);
          rings.push({ pos, mesh, done: false });
        }
      },
      update(dt) {
        timeLeft -= dt;
        const p = G.game.player; const pc = p.chest(new T.Vector3());
        for (let q = 0; q < rings.length; q++) {
          const r = rings[q];
          if (r.done) { r.mesh.scale.multiplyScalar(1 + dt * 4); r.mesh.material.opacity = Math.max(0, (r.mesh.material.opacity || 1) - dt * 3); r.mesh.material.transparent = true; if (r.mesh.material.opacity <= 0) r.mesh.visible = false; continue; }
          const active = q === idx;
          r.mesh.material.color.setRGB(active ? 0.5 : 0.25, active ? 2.4 : 0.35, active ? 2.8 : 0.5);
          r.mesh.rotation.z += dt * (active ? 1.5 : 0.3);
          if (active && pc.distanceTo(r.pos) < 5.4) {
            r.done = true; idx++; done++;
            G.Audio.play('ring', 1);
            G.game.addScore(150, 'RING');
            G.FX.burst(r.pos.x, r.pos.y, r.pos.z, 24, [0.6, 2.4, 2.8], 10, 0.8, 0.6, 0);
            timeLeft += 2.5;
          }
        }
        if (done >= n) return 'done';
        if (timeLeft <= 0) return 'fail';
      },
      markers() { const r = rings[idx]; return r ? [{ x: r.pos.x, y: r.pos.y, z: r.pos.z, color: '#4fe9ff', label: 'RING ' + (idx + 1) }] : []; },
      cleanup() { for (const r of rings) scene.remove(r.mesh); }
    };
  }

  function rescueMission(ctx, n) {
    const roofs = [];
    for (let k = 0; k < n; k++) roofs.push(pickRoof(ctx.city, ctx.rnd, ctx.from, 90, 380, 55, 170, roofs));
    const orbs = [];
    return {
      type: 'rescue', title: 'Rooftop Rescue', brief: 'Civilians are stranded on rooftops. Reach them all - watch out for guards!',
      objective: () => 'Rescue the civilians', progress: () => orbs.filter((o) => o.got).length + '/' + n, reward: 1000 + n * 80,
      start() {
        roofs.forEach((b) => {
          const s = G.City.roofSpot(b, ctx.rnd);
          const g = makeBeam(COL.green, 1.4, 300); g.position.set(s.x, s.y, s.z);
          const orb = new T.Mesh(new T.SphereGeometry(0.6, 14, 10), new T.MeshBasicMaterial()); orb.material.color.setRGB(0.6, 3, 1.4); orb.position.set(s.x, s.y + 1.6, s.z); scene.add(orb);
          orbs.push({ beam: g, orb, x: s.x, y: s.y, z: s.z, got: false, t: ctx.rnd() * 6 });
          for (let q = 0; q < 2; q++) { const gs = G.City.roofSpot(b, ctx.rnd); G.Enemies.spawn('thug', gs.x, gs.y, gs.z, {}); }
        });
      },
      update(dt) {
        const p = G.game.player.body;
        let left = 0;
        for (const o of orbs) {
          if (o.got) continue;
          left++;
          o.t += dt; o.orb.position.y = o.y + 1.6 + Math.sin(o.t * 3) * 0.3; o.beam.userData.ring.rotation.z += dt * 2;
          if (Math.hypot(p.x - o.x, p.z - o.z) < 3.4 && Math.abs(p.y - o.y) < 4) {
            o.got = true; o.beam.visible = false; o.orb.visible = false; left--;
            G.Audio.play('pickup', 1); G.game.addScore(200, 'RESCUED');
            G.FX.burst(o.x, o.y + 1.5, o.z, 20, [0.6, 3, 1.4], 8, 0.7, 0.6, 0);
          }
        }
        if (left === 0) return 'done';
      },
      markers: () => orbs.filter((o) => !o.got).map((o) => ({ x: o.x, y: o.y + 4, z: o.z, color: '#5dff9c', label: 'CIVILIAN' })),
      cleanup() { for (const o of orbs) { scene.remove(o.beam); scene.remove(o.orb); } }
    };
  }

  function bossMission(ctx, lvl) {
    let boss = null;
    const px = PITCH * 0.5, pz = PITCH * 0.5;
    let beam;
    return {
      type: 'boss', title: 'Titan Enforcer', brief: 'The Titan Enforcer has taken the plaza by the Central Tower. End this!',
      objective: () => 'Defeat the Titan Enforcer', progress: () => (boss && !boss.dead ? Math.ceil(boss.hp / boss.maxHp * 100) + '%' : '0%'), reward: 3000,
      start() {
        boss = G.Enemies.spawn('boss', px, 0, pz, { alert: true, hpMul: 1 + (lvl || 0) * 0.3, tag: 'boss' });
        for (let k = 0; k < 4; k++) G.Enemies.spawn('thug', px + (ctx.rnd() - 0.5) * 30, 0, pz + (ctx.rnd() - 0.5) * 30, { alert: true });
        G.game.boss = boss;
        beam = makeBeam(COL.violet, 3.5, 320); beam.position.set(px, 0, pz);
      },
      update(dt) {
        beam.userData.ring.rotation.z += dt * 2;
        if (boss.dead) { G.game.boss = null; return 'done'; }
        beam.position.x = boss.body.x; beam.position.z = boss.body.z;
      },
      markers: () => (boss && !boss.dead ? [{ x: boss.body.x, y: boss.body.y + 6, z: boss.body.z, color: '#c07bff', label: 'TITAN' }] : []),
      cleanup() { scene.remove(beam); G.game.boss = null; }
    };
  }

  // ------------------------------------------------------------ mission sequence
  function build(idx, ctx) {
    switch (idx) {
      case 0: return reachMission(ctx);
      case 1: return defeatMission(ctx, 5, 'thug');
      case 2: return ringsMission(ctx, 8);
      case 3: return defeatMission(ctx, 6, 'drone');
      case 4: return rescueMission(ctx, 4);
      case 5: return bossMission(ctx, 0);
      default: {
        const k = idx - 6, lvl = Math.floor(k / 5) + 1;
        switch (k % 5) {
          case 0: return defeatMission(ctx, 6 + lvl * 2, 'thug', 'Gang War');
          case 1: return ringsMission(ctx, Math.min(12, 8 + lvl));
          case 2: return defeatMission(ctx, 7 + lvl * 2, 'drone', 'Drone Storm');
          case 3: return rescueMission(ctx, Math.min(6, 4 + lvl - 1));
          default: return bossMission(ctx, lvl);
        }
      }
    }
  }

  M.init = function (sc, city) { scene = sc; M.city = city; Pk.init(sc); };

  M.reset = function () {
    if (M.cur) M.cur.cleanup();
    M.cur = null; M.index = -1; M.wait = 0; M.completed = 0;
    G.Enemies.clear(); Pk.clear();
  };

  M.startIndex = function (idx) {
    if (M.cur) M.cur.cleanup();
    const city = M.city, P = G.game.player.body;
    const ctx = { city, rnd: G.rng(9000 + idx * 31 + Math.floor(Math.random() * 1000)), from: { x: P.x, z: P.z } };
    M.index = idx;
    M.cur = build(idx, ctx);
    M.cur.ctx = ctx;
    M.cur.startTime = performance.now();
    M.cur.start();
    G.HUD.banner('MISSION ' + (idx + 1), M.cur.title.toUpperCase() + ' — ' + M.cur.brief);
    G.Audio.play('start', 0.8);
  };

  M.restartCurrent = function () {
    // keep index, rebuild the mission around the current player position (used on death / timeout)
    const idx = M.index;
    if (M.cur) M.cur.cleanup();
    G.Enemies.clear();
    M.cur = null;
    M.startIndex(idx);
  };

  M.update = function (dt) {
    Pk.update(dt, G.game.player);
    if (M.wait > 0) {
      M.wait -= dt;
      if (M.wait <= 0) M.startIndex(M.index + 1);
      return;
    }
    if (!M.cur) return;
    const r = M.cur.update(dt);
    if (r === 'done') {
      const m = M.cur; M.cur.cleanup(); M.cur = null; M.completed++;
      G.game.addScore(m.reward, 'MISSION COMPLETE');
      G.game.player.hp = Math.min(G.game.player.maxHp, G.game.player.hp + 35);
      G.HUD.banner('MISSION COMPLETE', m.title.toUpperCase() + '  +' + m.reward, true);
      G.Audio.play('mission', 1);
      M.wait = 5;
      G.Enemies.list.forEach((e) => { if (!e.dead && e.type !== 'boss') e.alert = false; });
    } else if (r === 'fail') {
      G.HUD.banner('TIME UP', 'Try again!', false, true);
      G.Audio.play('fail', 1);
      M.restartCurrent();
    }
  };

  M.onKill = function () { /* progress is polled by missions each frame */ };
})();
