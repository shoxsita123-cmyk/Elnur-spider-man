/* Procedural characters: the masked hero, thugs, boss and drones */
(function () {
  'use strict';
  const G = window.G, T = THREE;

  const _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3();
  const UP_DOWN = new T.Vector3(0, -1, 0);

  const PRESETS = {
    hero: {
      suit: 0x1c3fd0, accent: 0xd91e2c, glove: 0xd91e2c, boot: 0xd91e2c, skin: 0xe0ac86, mask: 0xd91e2c,
      gold: 0xffc83a, eye: [0.5, 2.4, 3.0], cape: true, capeColor: 0xc4162a, gun: false, fin: 0x1c3fd0, helmet: false, belt: 0xffc83a
    },
    thug: {
      suit: 0x2c303c, accent: 0x3a3f50, glove: 0x15171e, boot: 0x15171e, skin: 0xc79a78, mask: 0x1b1d26,
      gold: 0xff7a1a, eye: [3.2, 1.2, 0.2], cape: false, gun: true, fin: 0x1b1d26, helmet: true, belt: 0xff7a1a
    },
    boss: {
      suit: 0x3a1018, accent: 0x7a1624, glove: 0x15171e, boot: 0x15171e, skin: 0xc79a78, mask: 0x1b1d26,
      gold: 0xffc83a, eye: [3.4, 0.4, 0.3], cape: true, capeColor: 0x2a0b12, gun: true, fin: 0xffc83a, helmet: true, belt: 0xffc83a
    }
  };

  function buildHumanoid(kind, scale) {
    const P = PRESETS[kind] || PRESETS.hero;
    const flashMats = [];
    const matCache = {};
    function M(hex, rough, metal, noFlash) {
      const key = hex + '_' + rough + '_' + metal;
      if (matCache[key]) return matCache[key];
      const m = new T.MeshStandardMaterial({ color: hex, roughness: rough == null ? 0.45 : rough, metalness: metal || 0.05, emissive: 0xff2010, emissiveIntensity: 0, envMapIntensity: 0.8 });
      if (!noFlash) flashMats.push(m);
      return (matCache[key] = m);
    }
    const glow = (hex, i) => { const m = new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: i || 2.5, roughness: 0.4 }); return m; };
    const glowBasic = (rgb) => { const m = new T.MeshBasicMaterial({}); m.color.setRGB(rgb[0], rgb[1], rgb[2]); return m; };

    const add = (geo, mat, parent, x, y, z, sx, sy, sz) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (sx !== undefined) m.scale.set(sx, sy, sz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const grp = (parent, x, y, z) => { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };

    const root = new T.Group();
    const model = grp(root, 0, 0, 0);
    model.scale.setScalar(scale || 1);
    const body = grp(model, 0, 1.01, 0);

    // pelvis
    add(new T.SphereGeometry(1, 14, 10), M(P.suit), body, 0, 0, 0, 0.19, 0.12, 0.13);
    const torso = grp(body, 0, 0.06, 0);
    add(new T.CylinderGeometry(0.17, 0.15, 0.22, 14), M(P.suit), torso, 0, 0.1, 0, 1, 1, 0.66);
    add(new T.CylinderGeometry(0.235, 0.17, 0.36, 16), M(P.accent, 0.4), torso, 0, 0.38, 0, 1, 1, 0.64);
    add(new T.CylinderGeometry(0.178, 0.178, 0.05, 14), M(P.belt, 0.3, 0.6), torso, 0, 0.0, 0, 1, 1, 0.68);
    const emblem = add(new T.OctahedronGeometry(1), glow(P.gold, kind === 'hero' ? 1.6 : 1.2), torso, 0, 0.4, 0.122, 0.07, 0.1, 0.014);
    if (kind === 'hero') {
      // blue chest side-stripes
      add(new T.BoxGeometry(0.05, 0.3, 0.02), M(P.suit), torso, -0.12, 0.36, 0.1, 1, 1, 1).rotation.z = -0.25;
      add(new T.BoxGeometry(0.05, 0.3, 0.02), M(P.suit), torso, 0.12, 0.36, 0.1, 1, 1, 1).rotation.z = 0.25;
    }
    add(new T.CylinderGeometry(0.055, 0.065, 0.1, 10), M(P.mask), torso, 0, 0.6, 0);

    // head
    const head = grp(torso, 0, 0.72, 0);
    add(new T.SphereGeometry(0.128, 20, 14), M(P.mask, 0.35), head, 0, 0, 0, 0.95, 1.08, 1.0);
    if (kind === 'hero') {
      add(new T.SphereGeometry(0.07, 12, 8), M(P.skin, 0.6, 0, true), head, 0, -0.085, 0.075, 1.0, 0.75, 0.9);
      // forehead emblem
      add(new T.OctahedronGeometry(1), glow(P.gold, 1.4), head, 0, 0.1, 0.118, 0.022, 0.03, 0.01);
    } else {
      add(new T.SphereGeometry(0.06, 10, 8), M(P.skin, 0.6, 0, true), head, 0, -0.095, 0.06, 1.0, 0.6, 0.8);
      // visor
      add(new T.BoxGeometry(0.2, 0.05, 0.03), glowBasic(P.eye), head, 0, 0.02, 0.118, 1, 1, 1);
      add(new T.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M(P.mask, 0.3, 0.4), head, 0, 0.0, 0, 1.0, 1.1, 1.0);
    }
    if (kind === 'hero') {
      for (const s of [-1, 1]) {
        const lens = add(new T.SphereGeometry(1, 12, 8), glowBasic(P.eye), head, s * 0.056, 0.022, 0.116, 0.05, 0.026, 0.02);
        lens.rotation.z = s * 0.4; lens.castShadow = false;
        const fin = add(new T.ConeGeometry(0.028, 0.17, 6), M(P.fin, 0.4), head, s * 0.125, 0.02, -0.03, 1, 1, 1);
        fin.rotation.x = -Math.PI / 2 + 0.25; fin.rotation.z = -s * 0.5;
      }
    } else if (kind === 'boss') {
      for (const s of [-1, 1]) { const h = add(new T.ConeGeometry(0.03, 0.2, 6), M(P.fin, 0.4, 0.5), head, s * 0.09, 0.14, 0, 1, 1, 1); h.rotation.z = -s * 0.35; }
    }

    // shoulders + arms
    const shoulders = [], elbows = [], hands = [];
    for (let s = 0; s < 2; s++) {
      const sd = s ? 1 : -1;
      add(new T.SphereGeometry(0.088, 12, 10), M(P.accent, 0.4), torso, sd * 0.262, 0.53, 0, 1, 1, 1);
      const sh = grp(torso, sd * 0.268, 0.52, 0);
      add(new T.CapsuleGeometry(0.058, 0.2, 4, 10), M(P.suit, 0.4), sh, 0, -0.15, 0, 1, 1, 1);
      const el = grp(sh, 0, -0.3, 0);
      add(new T.CapsuleGeometry(0.052, 0.17, 4, 10), M(kind === 'hero' ? P.suit : P.accent, 0.4), el, 0, -0.14, 0, 1, 1, 1);
      if (kind === 'hero') add(new T.CylinderGeometry(0.056, 0.056, 0.04, 10), glow(0x6fe8ff, 2.2), el, 0, -0.2, 0, 1, 1, 1);
      const hand = grp(el, 0, -0.3, 0);
      add(new T.SphereGeometry(0.064, 12, 10), M(P.glove, 0.5), hand, 0, 0, 0, 1, 1.05, 1);
      if (P.gun && s === 1) {
        add(new T.BoxGeometry(0.06, 0.34, 0.09), M(0x14161c, 0.4, 0.6, true), hand, 0, -0.14, 0, 1, 1, 1);
        add(new T.BoxGeometry(0.05, 0.1, 0.07), M(0x14161c, 0.4, 0.6, true), hand, 0, -0.03, 0.06, 1, 1, 1);
        const tip = grp(hand, 0, -0.33, 0); hand.userData.muzzle = tip;
      }
      shoulders.push(sh); elbows.push(el); hands.push(hand);
    }
    // legs
    const hips = [], knees = [];
    for (let s = 0; s < 2; s++) {
      const sd = s ? 1 : -1;
      const hp = grp(body, sd * 0.1, -0.04, 0);
      add(new T.CapsuleGeometry(0.086, 0.3, 4, 10), M(P.suit, 0.4), hp, 0, -0.23, 0, 1, 1, 1);
      const kn = grp(hp, 0, -0.46, 0);
      add(new T.CapsuleGeometry(0.066, 0.3, 4, 10), M(P.suit, 0.4), kn, 0, -0.22, 0, 1, 1, 1);
      add(new T.BoxGeometry(0.115, 0.15, 0.28), M(P.boot, 0.45), kn, 0, -0.44, 0.045, 1, 1, 1);
      add(new T.BoxGeometry(0.12, 0.04, 0.29), M(0x14161c, 0.8), kn, 0, -0.5, 0.045, 1, 1, 1);
      add(new T.BoxGeometry(0.125, 0.06, 0.1), M(P.boot === 0xd91e2c ? 0xffc83a : P.gold, 0.4, 0.5), kn, 0, -0.36, -0.03, 1, 1, 1);
      hips.push(hp); knees.push(kn);
    }

    // cape (deformable plane)
    let capeGeo = null, capeBase = null;
    if (P.cape) {
      capeGeo = new T.PlaneGeometry(0.5, 0.95, 4, 8);
      capeGeo.translate(0, -0.475, 0);
      capeBase = capeGeo.attributes.position.array.slice();
      const capeMat = new T.MeshStandardMaterial({ color: P.capeColor, roughness: 0.65, side: T.DoubleSide, emissive: 0xff2010, emissiveIntensity: 0 });
      flashMats.push(capeMat);
      const cape = add(capeGeo, capeMat, torso, 0, 0.55, -0.12, 1, 1, 1);
      cape.castShadow = true; cape.frustumCulled = false;
    }

    // web shell for stunned enemies
    const shell = new T.Mesh(new T.IcosahedronGeometry(1.0, 1), new T.MeshBasicMaterial({ color: 0xdff6ff, wireframe: true, transparent: true, opacity: 0.85 }));
    shell.position.y = 0.95; shell.visible = false; model.add(shell);

    const h = {
      root, model, body, torso, head, shoulders, elbows, hands, hips, knees, emblem, shell,
      phase: 0, cphase: 0, time: Math.random() * 10, capeBack: 0, flash: 0,
      j: { hip: [0, 0], knee: [0, 0], el: [-0.2, -0.2], lean: 0, roll: 0, twist: 0, bodyY: 1.01, head: 0 }
    };

    h.flashHit = function (v) { h.flash = v; };

    h.animate = function (dt, s) {
      h.time += dt;
      const t = h.time, j = h.j;
      const hs = s.hspeed || 0;
      let tHip = [0, 0], tKnee = [0.05, 0.05], tEl = [-0.2, -0.2], tShX = [0, 0], tShZ = [0.12, 0.12];
      let tLean = 0, tRoll = 0, tTwist = 0, tBodyY = 1.01, tHead = 0, k = 13;
      let aimArm = -1;
      let aimDir = null;

      if (s.climbing) {
        h.cphase += dt * (s.climbSpeed || 0) * 1.6;
        for (let i = 0; i < 2; i++) {
          const p = h.cphase + (i ? 0 : Math.PI);
          tShX[i] = -2.55 + Math.sin(p) * 0.45; tShZ[i] = 0.3;
          tEl[i] = -0.35 - 0.35 * Math.cos(p);
          tHip[i] = -0.8 + Math.sin(p + 1.4) * 0.38; tKnee[i] = 1.25 + Math.cos(p + 1.4) * 0.35;
        }
        tLean = -0.05; tBodyY = 1.0; k = 10;
      } else if (s.swinging) {
        tLean = 0.62; tRoll = (s.roll || 0);
        tHip = [-0.4, 0.6]; tKnee = [0.95, 0.75];
        tShX = [0.7, 0]; tEl = [-0.5, -0.1]; tShZ = [0.35, 0.2];
        aimArm = 1; aimDir = s.aimLocal; tBodyY = 1.0; tHead = -0.35; k = 9;
      } else if (!s.grounded) {
        const fall = G.clamp(-(s.vy || 0) / 20, 0, 1);
        tHip = [-0.75 + fall * 0.2, 0.4]; tKnee = [1.15, 0.6];
        tShX = [-0.35, -0.2]; tShZ = [1.05 + fall * 0.8, 1.05 + fall * 0.8]; tEl = [-0.3, -0.3];
        tLean = 0.12 + G.clamp(hs / 60, 0, 0.25); tBodyY = 1.03; k = 9;
      } else if (hs > 0.6) {
        h.phase += dt * hs * 1.15;
        const A = G.clamp(0.25 + hs * 0.04, 0, 0.95);
        const ramp = G.clamp(hs / 3, 0, 1);
        for (let i = 0; i < 2; i++) {
          const p = h.phase + (i ? 0 : Math.PI);
          tHip[i] = -Math.sin(p) * A;
          tKnee[i] = Math.max(0, Math.cos(p)) * A * 1.45 + 0.08;
          tShX[i] = Math.sin(p) * A * 0.95; tShZ[i] = 0.1;
          tEl[i] = -0.45 - hs * 0.03;
        }
        tTwist = Math.sin(h.phase) * 0.16 * ramp;
        tLean = G.clamp(hs * 0.022, 0, 0.4);
        tBodyY = 1.01 - 0.02 * A + Math.abs(Math.sin(h.phase)) * 0.06 * ramp;
        k = 16;
      } else {
        tBodyY = 1.01 + Math.sin(t * 2.2) * 0.006;
        tShZ = [0.14, 0.14]; tEl = [-0.25 + Math.sin(t * 2.2) * 0.03, -0.25];
        tKnee = [0.06, 0.06];
      }

      // landing crouch
      if (s.landT > 0) {
        const l = G.clamp(s.landT, 0, 1);
        tBodyY -= 0.3 * l; tHip = [tHip[0] - 0.8 * l, tHip[1] - 0.8 * l]; tKnee = [tKnee[0] + 1.3 * l, tKnee[1] + 1.3 * l]; tLean += 0.3 * l; k = 18;
      }

      // strike (punch / kick)
      if (s.strikeT > 0 && s.strikeT < 1) {
        const p = s.strikeT, sw = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
        const si = s.strikeSide ? 1 : 0;
        if (s.grounded) {
          tShX[si] = -1.6 * sw; tEl[si] = -0.2 - 0.2 * (1 - sw); tShZ[si] = 0.1;
          tShX[1 - si] = 0.5 * sw; tEl[1 - si] = -1.5 * sw;
          tTwist = (si ? -0.7 : 0.7) * sw; tLean += 0.15 * sw;
          if (aimArm === 1 && si === 1) aimArm = -1;
        } else {
          tHip[si] = -1.55 * sw; tKnee[si] = 0.15; tLean = -0.15 * sw + tLean * 0.5;
          tShX = [-0.6 * sw, -0.6 * sw]; tShZ = [1.2, 1.2];
        }
        k = 24;
      }

      // enemies aiming a weapon
      if (s.aiming && aimArm < 0) {
        aimArm = 1; aimDir = s.aimLocal; tLean += 0.06; tShZ[1] = 0.0;
      }

      const kk = 1 - Math.exp(-k * dt);
      for (let i = 0; i < 2; i++) {
        j.hip[i] += (tHip[i] - j.hip[i]) * kk;
        j.knee[i] += (tKnee[i] - j.knee[i]) * kk;
        j.el[i] += (tEl[i] - j.el[i]) * kk;
        hips[i].rotation.x = j.hip[i];
        knees[i].rotation.x = j.knee[i];
        elbows[i].rotation.x = j.el[i];
        const sd = i ? 1 : -1;
        if (i === aimArm && aimDir) {
          _q.setFromUnitVectors(UP_DOWN, aimDir);
          shoulders[i].quaternion.slerp(_q, 1 - Math.exp(-18 * dt));
          elbows[i].rotation.x += (0 - elbows[i].rotation.x) * 0.8;
        } else {
          _q.setFromEuler(_e.set(tShX[i], 0, sd * tShZ[i]));
          shoulders[i].quaternion.slerp(_q, kk);
        }
      }
      j.lean += (tLean - j.lean) * kk;
      j.roll += (tRoll - j.roll) * kk;
      j.twist += (tTwist - j.twist) * kk;
      j.bodyY += (tBodyY - j.bodyY) * kk;
      j.head += (tHead - j.head) * kk;
      body.rotation.set(j.lean, 0, j.roll);
      body.position.y = j.bodyY;
      torso.rotation.y = j.twist;
      head.rotation.x = j.head;

      // cape
      if (capeGeo) {
        const speedF = G.clamp(hs / 26, 0, 1);
        const fall = G.clamp(-(s.vy || 0) / 24, 0, 1) * (s.grounded ? 0 : 1);
        const climb = s.climbing ? 1 : 0;
        const tb = 0.05 + speedF * 0.55 + fall * 0.5 + (s.swinging ? 0.3 : 0) - climb * 0.04;
        h.capeBack += (tb - h.capeBack) * (1 - Math.exp(-6 * dt));
        const pa = capeGeo.attributes.position, base = capeBase;
        const cols = 5, rows = 9;
        for (let r = 0; r < rows; r++) {
          const f = r / (rows - 1);
          for (let c = 0; c < cols; c++) {
            const idx = (r * cols + c) * 3;
            const bx = base[idx], by = base[idx + 1];
            const fl = Math.sin(t * 11 + f * 5 + bx * 7) * 0.035 * f * (0.25 + speedF + fall);
            pa.array[idx] = bx * (1 + f * 0.4);
            pa.array[idx + 1] = by * (1 - 0.35 * speedF - 0.2 * fall) + f * f * 0.3 * fall;
            pa.array[idx + 2] = -(0.02 + f * f * 0.1 + f * h.capeBack * 0.55) + fl + (s.swinging ? Math.sin(t * 6 + f * 3) * 0.02 * f : 0);
          }
        }
        pa.needsUpdate = true;
        capeGeo.computeVertexNormals();
      }

      // flash
      if (h.flash > 0) h.flash = Math.max(0, h.flash - dt * 4);
      for (const m of flashMats) m.emissiveIntensity = h.flash * 1.4;
      emblem.rotation.y = Math.sin(t * 2) * 0.1;
    };

    h.worldMuzzle = function (out) {
      const mz = hands[1].userData.muzzle;
      if (!mz) return out.copy(root.position).add(_v.set(0, 1.4, 0));
      return mz.getWorldPosition(out);
    };
    h.setShadow = function (v) { root.traverse((o) => { if (o.isMesh) o.castShadow = v; }); };
    return h;
  }

  function buildDrone() {
    const root = new T.Group();
    const metal = new T.MeshStandardMaterial({ color: 0x2b2f3c, roughness: 0.35, metalness: 0.8, emissive: 0xff2010, emissiveIntensity: 0 });
    const accent = new T.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4, metalness: 0.5, emissive: 0xff2010, emissiveIntensity: 0 });
    const model = new T.Group(); root.add(model);
    const core = new T.Mesh(new T.SphereGeometry(0.5, 20, 14), metal); core.scale.set(1, 0.7, 1); core.castShadow = true; model.add(core);
    const ring = new T.Mesh(new T.TorusGeometry(0.62, 0.07, 8, 24), accent); ring.rotation.x = Math.PI / 2; ring.castShadow = true; model.add(ring);
    const eyeMat = new T.MeshBasicMaterial(); eyeMat.color.setRGB(3.2, 0.25, 0.2);
    const eye = new T.Mesh(new T.SphereGeometry(0.2, 12, 10), eyeMat); eye.position.set(0, -0.02, 0.4); eye.scale.z = 0.6; model.add(eye);
    const rotors = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const arm = new T.Mesh(new T.BoxGeometry(0.9, 0.05, 0.07), metal);
      arm.position.set(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5); arm.rotation.y = -a; arm.castShadow = true; model.add(arm);
      const rot = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.015, 14), new T.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false }));
      rot.position.set(Math.cos(a) * 0.95, 0.16, Math.sin(a) * 0.95); model.add(rot); rotors.push(rot);
    }
    const shell = new T.Mesh(new T.IcosahedronGeometry(0.9, 1), new T.MeshBasicMaterial({ color: 0xdff6ff, wireframe: true, transparent: true, opacity: 0.85 }));
    shell.visible = false; model.add(shell);
    const d = { root, model, rotors, shell, flash: 0, time: 0 };
    d.flashHit = (v) => { d.flash = v; };
    d.animate = function (dt, s) {
      d.time += dt;
      for (const r of rotors) r.rotation.y += dt * 40;
      model.position.y = Math.sin(d.time * 3) * 0.08;
      model.rotation.x = G.damp(model.rotation.x, G.clamp((s.hspeed || 0) * 0.03, 0, 0.5), 6, dt);
      if (d.flash > 0) d.flash = Math.max(0, d.flash - dt * 4);
      metal.emissiveIntensity = accent.emissiveIntensity = d.flash * 1.4;
    };
    return d;
  }

  G.buildHumanoid = buildHumanoid;
  G.buildDrone = buildDrone;
})();
