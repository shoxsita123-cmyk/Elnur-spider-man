/* Procedural city: skyscrapers, roads, props, parks, traffic */
(function () {
  'use strict';
  const G = window.G, T = THREE, W = G.World;
  const { PITCH, BLOCK, ROAD, HALF } = G.CITY;
  const FAR = 10;           // far-block ring (visual only)
  const TW = 28, TH = 28;   // window texture tile size in metres

  const col = (hex) => { const c = new T.Color(hex); return [c.r, c.g, c.b]; };
  const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const shade = (y) => 0.38 + 0.62 * smooth01(y / 60);

  /** Minimal non-indexed geometry builder with vertex colours */
  class Builder {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
    v(x, y, z, nx, ny, nz, c, s, u, v) {
      this.p.push(x, y, z); this.n.push(nx, ny, nz);
      this.c.push(c[0] * s, c[1] * s, c[2] * s); this.u.push(u, v);
    }
    quad(a, b, c, d, nx, ny, nz, color, sa, sb, ua, ub, va, vb) {
      this.v(a[0], a[1], a[2], nx, ny, nz, color, sa, ua, va);
      this.v(b[0], b[1], b[2], nx, ny, nz, color, sa, ub, va);
      this.v(c[0], c[1], c[2], nx, ny, nz, color, sb, ub, vb);
      this.v(a[0], a[1], a[2], nx, ny, nz, color, sa, ua, va);
      this.v(c[0], c[1], c[2], nx, ny, nz, color, sb, ub, vb);
      this.v(d[0], d[1], d[2], nx, ny, nz, color, sb, ua, vb);
    }
    /** four side faces of a box; detail => ambient-occlusion style vertical shading strips */
    sides(x0, y0, z0, x1, y1, z1, color, uo, vo, detail, flat) {
      let ys = [y0, y1];
      if (detail) {
        ys = [y0];
        for (const t of [6, 20, 50]) if (t > y0 + 0.5 && t < y1 - 0.5) ys.push(t);
        ys.push(y1);
      }
      for (let i = 0; i < ys.length - 1; i++) {
        const ya = ys[i], yb = ys[i + 1];
        const sa = flat ? 1 : shade(ya), sb = flat ? 1 : shade(yb);
        const va = ya / TH + vo, vb = yb / TH + vo;
        this.quad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], 0, 0, 1, color, sa, sb, x0 / TW + uo, x1 / TW + uo, va, vb);
        this.quad([x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], 0, 0, -1, color, sa, sb, x1 / TW + uo, x0 / TW + uo, va, vb);
        this.quad([x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], 1, 0, 0, color, sa, sb, z1 / TW + uo + 0.37, z0 / TW + uo + 0.37, va, vb);
        this.quad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], -1, 0, 0, color, sa, sb, z0 / TW + uo + 0.37, z1 / TW + uo + 0.37, va, vb);
      }
    }
    top(x0, y, z0, x1, z1, color, s) {
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0, 1, 0, color, s || 1, s || 1, 0, 1, 0, 1);
    }
    box(x0, y0, z0, x1, y1, z1, color, s) {
      this.sides(x0, y0, z0, x1, y1, z1, [color[0] * (s || 1), color[1] * (s || 1), color[2] * (s || 1)], 0, 0, false, true);
      this.top(x0, y1, z0, x1, z1, color, (s || 1) * 1.12);
    }
    geo(geometry, matrix, color, s) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const pos = g.attributes.position, nor = g.attributes.normal;
      const nm = new T.Matrix3().getNormalMatrix(matrix);
      const v = new T.Vector3(), n = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        this.v(v.x, v.y, v.z, n.x, n.y, n.z, color, s || 1, 0, 0);
      }
    }
    get count() { return this.p.length / 3; }
    build() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.p), 3));
      g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(this.u), 2));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  // ---------------- textures ----------------
  const PALETTES = [
    { name: 'warm', lit: 0.5, colors: ['#ffcf7a', '#ffb25e', '#ffe3a3', '#ffd9a0'] },
    { name: 'cool', lit: 0.45, colors: ['#8ae6ff', '#b6f0ff', '#7fd0ff', '#d6f7ff'] },
    { name: 'neon', lit: 0.5, colors: ['#ff7ad9', '#c28bff', '#ffd0f0', '#ff9bd0'] },
    { name: 'mix', lit: 0.4, colors: ['#fff3c8', '#c9ffd8', '#ffffff', '#ffd9a0'] }
  ];

  function makeWindowTextures(pal, rnd, aniso) {
    const S = 512, N = 8, cell = S / N;
    const d = document.createElement('canvas'), e = document.createElement('canvas');
    d.width = d.height = e.width = e.height = S;
    const cd = d.getContext('2d'), ce = e.getContext('2d');
    cd.fillStyle = '#d9dce8'; cd.fillRect(0, 0, S, S);
    ce.fillStyle = '#000'; ce.fillRect(0, 0, S, S);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = c * cell, y = r * cell;
        cd.fillStyle = '#b4b8ca'; cd.fillRect(x, y + cell * 0.8, cell, cell * 0.2);
        cd.fillStyle = '#eceef6'; cd.fillRect(x, y, cell, 2);
        const wx = x + cell * 0.12, wy = y + cell * 0.12, ww = cell * 0.76, wh = cell * 0.6;
        const g = cd.createLinearGradient(0, wy, 0, wy + wh);
        g.addColorStop(0, '#223455'); g.addColorStop(1, '#0c1424');
        cd.fillStyle = g; cd.fillRect(wx, wy, ww, wh);
        cd.fillStyle = '#7f869c'; cd.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        // reflection streak
        cd.fillStyle = 'rgba(160,190,255,0.12)';
        cd.beginPath(); cd.moveTo(wx, wy + wh); cd.lineTo(wx + ww * 0.45, wy); cd.lineTo(wx + ww * 0.65, wy); cd.lineTo(wx + ww * 0.2, wy + wh); cd.fill();
        if (rnd() < pal.lit) {
          const colr = pal.colors[(rnd() * pal.colors.length) | 0];
          ce.globalAlpha = 0.45 + 0.55 * rnd();
          ce.fillStyle = colr;
          const half = rnd() < 0.18;
          ce.fillRect(wx, wy + (half ? wh * 0.45 : 0), ww, half ? wh * 0.55 : wh);
          ce.globalAlpha = 1;
          ce.fillStyle = '#000'; ce.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        }
      }
    }
    const mk = (cv, enc) => {
      const t = new T.CanvasTexture(cv);
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; t.encoding = T.sRGBEncoding;
      return t;
    };
    return { map: mk(d), emissive: mk(e) };
  }

  function makeGroundTexture(aniso) {
    const S = 1024, s = S / PITCH;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#2b2e38'; x.fillRect(0, 0, S, S);
    // asphalt speckle
    const r = G.rng(77);
    for (let i = 0; i < 9000; i++) {
      const v = 30 + r() * 28 | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',0.35)';
      x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    x.save(); x.translate(S / 2, S / 2); x.scale(s, s);
    // sidewalk
    x.fillStyle = '#8b8fa0'; x.fillRect(-32, -32, 64, 64);
    // tile seams
    x.strokeStyle = 'rgba(60,64,80,0.45)'; x.lineWidth = 0.08;
    for (let k = -32; k <= 32; k += 2) { x.beginPath(); x.moveTo(k, -32); x.lineTo(k, 32); x.stroke(); x.beginPath(); x.moveTo(-32, k); x.lineTo(32, k); x.stroke(); }
    // curb
    x.strokeStyle = '#c3c7d4'; x.lineWidth = 0.35; x.strokeRect(-32, -32, 64, 64);
    // under-building area
    x.fillStyle = '#5b5f70'; x.fillRect(-27, -27, 54, 54);
    // road markings
    const yel = '#f2c230', wht = '#e8e8f0';
    for (const sx of [-1, 1]) {
      // centre double yellow (half belongs to each tile)
      x.fillStyle = yel;
      x.fillRect(sx * 43 - 0.35, -32, 0.2, 64); x.fillRect(sx * 43 + 0.15, -32, 0.2, 64);
      x.fillRect(-32, sx * 43 - 0.35, 64, 0.2); x.fillRect(-32, sx * 43 + 0.15, 64, 0.2);
      // lane dividers
      x.fillStyle = wht;
      for (let k = -30; k < 30; k += 6) {
        x.fillRect(sx * 37.5 - 0.12, k, 0.24, 3);
        x.fillRect(k, sx * 37.5 - 0.12, 3, 0.24);
      }
    }
    // crosswalks
    x.fillStyle = wht;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let k = 33; k < 43; k += 1.3) {
        x.fillRect(sx * k - 0.35, sz * 29 - 1.5 + (sz > 0 ? 0 : 0), 0.7, 3);
        x.fillRect(sx * 29 - 1.5, sz * k - 0.35, 3, 0.7);
      }
    }
    // stop lines
    x.fillStyle = wht;
    for (const sx of [-1, 1]) {
      x.fillRect(sx > 0 ? 33 : -43, -26.5 * 0 + 26, 10, 0.4);
    }
    x.restore();
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; t.encoding = T.sRGBEncoding;
    return t;
  }

  // ---------------- car geometry ----------------
  function makeCarGeometry(bodyHex) {
    const b = new Builder();
    const body = col(bodyHex), glass = col('#12182a'), dark = col('#0b0b10'), head = [3.2, 3.0, 2.2], tail = [2.6, 0.2, 0.25], chrome = col('#9aa0b0');
    b.box(-2.2, 0.35, -0.9, 2.2, 0.95, 0.9, body, 1);
    b.sides(-1.15, 0.95, -0.8, 1.0, 1.45, 0.8, glass, 0, 0, false, true);
    b.box(-1.1, 1.45, -0.76, 0.9, 1.5, 0.76, body, 1);
    for (const sx of [-1.4, 1.35]) for (const sz of [-0.9, 0.9]) b.box(sx - 0.38, 0.0, sz - (sz > 0 ? 0.0 : 0.3), sx + 0.38, 0.76, sz + (sz > 0 ? 0.3 : 0.0), dark, 1);
    for (const sz of [-0.62, 0.62]) b.box(2.2, 0.55, sz - 0.18, 2.26, 0.75, sz + 0.18, head, 1);
    for (const sz of [-0.62, 0.62]) b.box(-2.26, 0.55, sz - 0.18, -2.2, 0.75, sz + 0.18, tail, 1);
    b.box(2.2, 0.38, -0.7, 2.28, 0.5, 0.7, chrome, 1);
    return b.build();
  }

  const CAR_COLORS = ['#e23b3b', '#2f6bff', '#f2c230', '#f4f4f8', '#20c9a8', '#a55bff', '#ff7a2f', '#1c1f2b'];

  // ---------------- main build ----------------
  G.City = {
    build(scene, seed, renderer) {
      W.reset();
      const rnd = G.rng(seed || 1337);
      const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
      const city = { buildings: [], roofs: [], rects: [], parks: [], group: new T.Group(), cars: [], spawn: null, rnd };
      scene.add(city.group);

      // materials / textures per palette
      const mats = PALETTES.map((p, i) => {
        const tex = makeWindowTextures(p, G.rng(100 + i), aniso);
        return new T.MeshStandardMaterial({
          map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 1.7,
          vertexColors: true, roughness: 0.5, metalness: 0.12, envMapIntensity: 0.9
        });
      });
      const roofMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
      const propMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
      const neonMat = new T.MeshBasicMaterial({ vertexColors: true });

      const facade = {}, roofs = {}, props = {};
      const neon = new Builder();
      const park = new Builder();
      const getB = (map, key) => map[key] || (map[key] = new Builder());

      const tints = ['#9fb6dc', '#e0a58c', '#8f9fd0', '#c493c4', '#80c9cd', '#dccb92', '#aeb0c2', '#d68a8a', '#7e9bc4', '#9ad0a8', '#e8b87a'].map(col);
      const roofCols = ['#6a6e80', '#7a7466', '#5c6272', '#807a8a', '#59685f'].map(col);
      const propCols = ['#8a8f9e', '#b8bcc8', '#6f7585', '#a58a6a'].map(col);
      const neonCols = [[2.6, 0.35, 1.6], [0.4, 2.2, 2.8], [2.8, 1.5, 0.3], [1.0, 0.6, 3.0], [0.4, 2.8, 1.2], [3.0, 0.5, 0.4]];
      const pal = (i, j) => (((i * 7 + j * 13) % 4) + 4) % 4;

      function chunkKey(i, j) {
        if (Math.abs(i) <= HALF && Math.abs(j) <= HALF) return 'c' + Math.floor((i + HALF) / 4) + '_' + Math.floor((j + HALF) / 4);
        return 'f' + (i >= 0 ? 1 : 0) + (j >= 0 ? 1 : 0);
      }

      function addTier(ck, pi, x0, z0, x1, z1, y0, y1, tint, solid, detail) {
        const uo = rnd() * 4, vo = Math.floor(rnd() * 8) / 8;
        getB(facade, pi + '|' + ck).sides(x0, y0, z0, x1, y1, z1, tint, uo, vo, detail, false);
        getB(roofs, ck).top(x0, y1, z0, x1, z1, roofCols[(rnd() * roofCols.length) | 0], 1);
        if (solid) W.addBox(x0, y0, z0, x1, y1, z1, 'building');
      }

      function addProps(ck, x0, z0, x1, z1, y, solid, count) {
        const pb = getB(props, ck);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        for (let k = 0; k < count; k++) {
          const w = 1.6 + rnd() * 1.6, d = 1.6 + rnd() * 1.6, h = 1.2 + rnd() * 1.4;
          const px = x0 + 2 + w / 2 + rnd() * Math.max(0.1, (x1 - x0 - 4 - w));
          const pz = z0 + 2 + d / 2 + rnd() * Math.max(0.1, (z1 - z0 - 4 - d));
          if (Math.hypot(px - cx, pz - cz) < 5.5) continue;
          pb.box(px - w / 2, y, pz - d / 2, px + w / 2, y + h, pz + d / 2, propCols[(rnd() * propCols.length) | 0], 1);
          pb.box(px - w / 2 + 0.2, y + h, pz - d / 2 + 0.2, px + w / 2 - 0.2, y + h + 0.12, pz + d / 2 - 0.2, propCols[0], 0.7);
          if (solid) W.addBox(px - w / 2, y, pz - d / 2, px + w / 2, y + h + 0.12, pz + d / 2, 'prop');
        }
        // water tower
        if (rnd() < 0.18 && x1 - x0 > 14 && z1 - z0 > 14) {
          const px = x0 + 4 + rnd() * (x1 - x0 - 8), pz = z0 + 4 + rnd() * (z1 - z0 - 8);
          if (Math.hypot(px - cx, pz - cz) > 6.5) {
            const wood = col('#7b5a3c'), metal = col('#555b6b');
            for (const lx of [-1, 1]) for (const lz of [-1, 1]) pb.box(px + lx * 1.2 - 0.1, y, pz + lz * 1.2 - 0.1, px + lx * 1.2 + 0.1, y + 2.4, pz + lz * 1.2 + 0.1, metal, 1);
            const cyl = new T.CylinderGeometry(1.8, 1.8, 3, 10);
            pb.geo(cyl, new T.Matrix4().makeTranslation(px, y + 3.9, pz), wood, 1);
            const cone = new T.ConeGeometry(2, 1.1, 10);
            pb.geo(cone, new T.Matrix4().makeTranslation(px, y + 5.95, pz), metal, 1);
            if (solid) W.addBox(px - 1.8, y, pz - 1.8, px + 1.8, y + 6.4, pz + 1.8, 'prop');
          }
        }
      }

      function addBuilding(i, j, ox, oz, lot, solid, far) {
        const ck = chunkKey(i, j);
        const pi = pal(i, j + ((rnd() * 2) | 0));
        const tint = tints[(rnd() * tints.length) | 0];
        const x0 = ox + lot.x0, x1 = ox + lot.x1, z0 = oz + lot.z0, z1 = oz + lot.z1;
        const w = x1 - x0, d = z1 - z0;
        const f = Math.max(0, 1 - Math.hypot(i, j) / 7.5);
        let h;
        if (rnd() < 0.14) h = 10 + rnd() * 14;
        else h = 26 + Math.pow(rnd(), 1.35) * (50 + 175 * Math.pow(f, 1.1));
        h = Math.min(h, 9 * Math.min(w, d));
        if (lot.forceH) h = lot.forceH;
        h = Math.round(h);
        const info = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w, d, h, top: h, minX: x0, maxX: x1, minZ: z0, maxZ: z1, solid, i, j };
        const detail = !far;
        // tiers
        let tiers = [[x0, z0, x1, z1, 0, h]];
        if (h > 70 && Math.min(w, d) >= 24 && rnd() < 0.65) {
          const h1 = h * (0.5 + rnd() * 0.2);
          const ins = 0.14 + rnd() * 0.1;
          const ix = w * ins, iz = d * ins;
          tiers = [[x0, z0, x1, z1, 0, h1], [x0 + ix, z0 + iz, x1 - ix, z1 - iz, h1, h]];
          if (h > 140 && rnd() < 0.55) {
            const h2 = h1 + (h - h1) * 0.65;
            tiers = [[x0, z0, x1, z1, 0, h1], [x0 + ix, z0 + iz, x1 - ix, z1 - iz, h1, h2], [x0 + ix * 2, z0 + iz * 2, x1 - ix * 2, z1 - iz * 2, h2, h]];
          }
        }
        for (const t of tiers) addTier(ck, pi, t[0], t[1], t[2], t[3], t[4], t[5], tint, solid, detail);
        const tt = tiers[tiers.length - 1];
        info.topBox = tt;
        info.cx = (tt[0] + tt[2]) / 2; info.cz = (tt[1] + tt[3]) / 2;
        if (!far) {
          // side tiers' roofs are partly covered; fine. Props on the top tier
          addProps(ck, tt[0], tt[1], tt[2], tt[3], h, solid, Math.min(4, Math.floor((tt[2] - tt[0]) * (tt[3] - tt[1]) / 220) + (rnd() < 0.5 ? 1 : 0)));
          // antenna
          if (h > 60 && rnd() < 0.5) {
            const ax = tt[0] + 3 + rnd() * (tt[2] - tt[0] - 6), az = tt[1] + 3 + rnd() * (tt[3] - tt[1] - 6);
            if (Math.hypot(ax - info.cx, az - info.cz) > 5) {
              const ah = 8 + rnd() * 18;
              getB(props, ck).box(ax - 0.4, h, az - 0.4, ax + 0.4, h + ah, az + 0.4, col('#8a90a2'), 1);
              neon.box(ax - 0.5, h + ah, az - 0.5, ax + 0.5, h + ah + 0.9, az + 0.5, [3.0, 0.25, 0.2]);
              if (solid) W.addBox(ax - 0.4, h, az - 0.4, ax + 0.4, h + ah, az + 0.4, 'antenna');
            }
          }
          // neon roof trim
          if (rnd() < 0.4) {
            const c = neonCols[(rnd() * neonCols.length) | 0], e = 0.25;
            neon.box(tt[0] - e, h - 0.9, tt[1] - e, tt[2] + e, h - 0.5, tt[1] + 0.05, c);
            neon.box(tt[0] - e, h - 0.9, tt[3] - 0.05, tt[2] + e, h - 0.5, tt[3] + e, c);
            neon.box(tt[0] - e, h - 0.9, tt[1], tt[0] + 0.05, h - 0.5, tt[3], c);
            neon.box(tt[2] - 0.05, h - 0.9, tt[1], tt[2] + e, h - 0.5, tt[3], c);
          }
          // vertical neon sign on a street-facing wall
          if (rnd() < 0.32 && h > 24) {
            const c = neonCols[(rnd() * neonCols.length) | 0];
            const sh = 5 + rnd() * 9, sy = 5 + rnd() * Math.min(20, h - sh - 6);
            const side = (rnd() * 4) | 0;
            if (side < 2) { const sx = x0 + 3 + rnd() * (w - 6), z = side ? z1 : z0 - 0.6; neon.box(sx, sy, side ? z : z, sx + 1.2, sy + sh, (side ? z1 + 0.6 : z0), c); }
            else { const sz = z0 + 3 + rnd() * (d - 6); neon.box(side === 2 ? x1 : x0 - 0.6, sy, sz, side === 2 ? x1 + 0.6 : x0, sy + sh, sz + 1.2, c); }
          }
          // aviation lights
          if (h > 110) neon.box(tt[0] + 0.5, h, tt[1] + 0.5, tt[0] + 1.2, h + 0.7, tt[1] + 1.2, [3.0, 0.2, 0.2]);
          city.rects.push({ x: info.x, z: info.z, w, d, h });
          if (solid && h >= 40 && h <= 230) city.roofs.push(info);
        }
        city.buildings.push(info);
        return info;
      }

      function layoutBlock(i, j) {
        const H = 27;
        const r = rnd(), lots = [];
        const sx = -4 + rnd() * 8, sz = -4 + rnd() * 8;
        if (r < 0.2) lots.push({ x0: -H + rnd() * 3, z0: -H + rnd() * 3, x1: H - rnd() * 3, z1: H - rnd() * 3 });
        else if (r < 0.46) { lots.push({ x0: -H, z0: -H, x1: sx - 2, z1: H }); lots.push({ x0: sx + 2, z0: -H, x1: H, z1: H }); }
        else if (r < 0.7) { lots.push({ x0: -H, z0: -H, x1: H, z1: sz - 2 }); lots.push({ x0: -H, z0: sz + 2, x1: H, z1: H }); }
        else if (r < 0.9) {
          lots.push({ x0: -H, z0: -H, x1: sx - 2, z1: sz - 2 }); lots.push({ x0: sx + 2, z0: -H, x1: H, z1: sz - 2 });
          lots.push({ x0: -H, z0: sz + 2, x1: sx - 2, z1: H }); lots.push({ x0: sx + 2, z0: sz + 2, x1: H, z1: H });
        } else {
          lots.push({ x0: -H, z0: -H, x1: sx - 2, z1: H });
          lots.push({ x0: sx + 2, z0: -H, x1: H, z1: sz - 2 }); lots.push({ x0: sx + 2, z0: sz + 2, x1: H, z1: H });
        }
        return lots.filter((l) => l.x1 - l.x0 >= 12 && l.z1 - l.z0 >= 12);
      }

      const lampCol = col('#3b4050');
      function addLamps(ox, oz) {
        const pb = getB(props, 'lamps');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const px = ox + sx * 30.6, pz = oz + sz * 30.6;
          pb.box(px - 0.12, 0, pz - 0.12, px + 0.12, 7, pz + 0.12, lampCol, 1);
          const ax = px + sx * 1.6, az = pz + sz * 1.6;
          pb.box(Math.min(px, ax) - 0.08, 6.9, Math.min(pz, az) - 0.08, Math.max(px, ax) + 0.08, 7.05, Math.max(pz, az) + 0.08, lampCol, 1);
          neon.box(ax - 0.5, 6.7, az - 0.35, ax + 0.5, 6.9, az + 0.35, [3.4, 2.5, 1.4]);
        }
      }

      function addPark(i, j, ox, oz) {
        const green = rnd() < 0.5 ? col('#2f7a46') : col('#3b8a4e');
        park.box(ox - 30, 0, oz - 30, ox + 30, 0.08, oz + 30, green, 1);
        const pb = getB(props, 'trees');
        const ico = new T.IcosahedronGeometry(2.6, 0);
        const pink = rnd() < 0.35;
        for (let k = 0; k < 26; k++) {
          const tx = ox - 26 + rnd() * 52, tz = oz - 26 + rnd() * 52;
          const s = 0.8 + rnd() * 0.8;
          pb.box(tx - 0.25, 0, tz - 0.25, tx + 0.25, 3 * s, tz + 0.25, col('#5a3f2a'), 1);
          const cc = (pink && rnd() < 0.6) ? col('#ff9ec7') : col(rnd() < 0.5 ? '#2a8a4a' : '#47a64e');
          const m = new T.Matrix4().compose(new T.Vector3(tx, 3 * s + 1.8 * s, tz), new T.Quaternion(), new T.Vector3(s, s * 0.95, s));
          pb.geo(ico, m, cc, 1);
        }
        // pond / plaza stripe
        park.box(ox - 5, 0.08, oz - 30, ox + 5, 0.1, oz + 30, col('#c9bfa8'), 1);
        city.parks.push({ x: ox, z: oz });
      }

      // --- inner city + far ring ---
      for (let i = -FAR; i <= FAR; i++) {
        for (let j = -FAR; j <= FAR; j++) {
          const inner = Math.abs(i) <= HALF && Math.abs(j) <= HALF;
          const ox = i * PITCH, oz = j * PITCH;
          if (inner) {
            addLamps(ox, oz);
            if (i === 0 && j === 0) {
              // central landmark tower
              const info = addBuilding(0, 0, 0, 0, { x0: -20, z0: -20, x1: 20, z1: 20, forceH: 250 }, true, false);
              const b = getB(props, 'c1_1');
              b.box(-2, 250, -2, 2, 295, 2, col('#c9ccd8'), 1);
              W.addBox(-2, 250, -2, 2, 295, 2, 'spire');
              neon.box(-2.6, 295, -2.6, 2.6, 300, 2.6, [4, 0.3, 0.3]);
              neon.box(-20.4, 120, -20.4, 20.4, 121.2, 20.4, [0.3, 2.2, 3.0]);
              neon.box(-20.4, 180, -20.4, 20.4, 181.2, 20.4, [3.0, 0.8, 2.4]);
              city.landmark = info;
              continue;
            }
            if (Math.max(Math.abs(i), Math.abs(j)) <= 4 && rnd() < 0.07) { addPark(i, j, ox, oz); continue; }
            for (const lot of layoutBlock(i, j)) addBuilding(i, j, ox, oz, lot, true, false);
          } else {
            // far ring: one or two simple blocks, no collision
            const lots = rnd() < 0.5 ? [{ x0: -26, z0: -26, x1: 26, z1: 26 }] : [{ x0: -26, z0: -26, x1: -2, z1: 26 }, { x0: 2, z0: -26, x1: 26, z1: 26 }];
            for (const lot of lots) {
              const bi = addBuilding(i, j, ox, oz, lot, false, true);
            }
          }
        }
      }

      // --- build meshes ---
      const addMesh = (geo, mat, cast, recv, name) => {
        const m = new T.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.name = name || '';
        city.group.add(m); return m;
      };
      let verts = 0;
      for (const key in facade) {
        const [pi, ck] = key.split('|');
        const inner = ck[0] === 'c';
        const g = facade[key].build(); verts += g.attributes.position.count;
        addMesh(g, mats[+pi], inner, inner, 'facade');
      }
      for (const key in roofs) { const inner = key[0] === 'c'; addMesh(roofs[key].build(), roofMat, inner, inner, 'roof'); }
      for (const key in props) addMesh(props[key].build(), propMat, true, true, 'props');
      addMesh(neon.build(), neonMat, false, false, 'neon');
      if (park.count) addMesh(park.build(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), false, true, 'park');

      // ground
      const gtex = makeGroundTexture(aniso);
      const size = 4400;
      gtex.repeat.set(size / PITCH, size / PITCH);
      gtex.offset.set(0.5 - ((size / 2) / PITCH % 1 + 1) % 1, 0.5 - ((size / 2) / PITCH % 1 + 1) % 1);
      const ground = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshStandardMaterial({ map: gtex, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.6 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'ground';
      city.group.add(ground);

      // --- traffic ---
      const carGeos = CAR_COLORS.map(makeCarGeometry);
      const carMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4, envMapIntensity: 1.0 });
      const NCARS = 64;
      const carsByColor = CAR_COLORS.map(() => []);
      const lanes = [];
      for (let k = -HALF - 1; k <= HALF; k++) {
        const c = (k + 0.5) * PITCH;
        for (const dir of [1, -1]) for (const off of [2.75, 8.25]) {
          lanes.push({ axis: 'x', c, dir, off }); // along X at z=c±off
          lanes.push({ axis: 'z', c, dir, off });
        }
      }
      for (let n = 0; n < NCARS; n++) {
        const lane = lanes.splice((rnd() * lanes.length) | 0, 1)[0];
        const ci = n % CAR_COLORS.length;
        const car = {
          lane, ci, speed: 9 + rnd() * 6, pos: (rnd() * 2 - 1) * G.CITY.bound, idx: carsByColor[ci].length,
          x: 0, z: 0, box: null, rot: 0
        };
        const hx = lane.axis === 'x' ? 2.2 : 0.9, hz = lane.axis === 'x' ? 0.9 : 2.2;
        car.box = W.addDynamic(0, 0, 0, 0, 1.5, 0, 'car');
        car.hx = hx; car.hz = hz;
        car.rot = lane.axis === 'x' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        carsByColor[ci].push(car); city.cars.push(car);
      }
      const dummy = new T.Object3D();
      city.carMeshes = carsByColor.map((arr, ci) => {
        if (!arr.length) return null;
        const im = new T.InstancedMesh(carGeos[ci], carMat, arr.length);
        im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false;
        city.group.add(im); return im;
      });
      city.updateCars = function (dt) {
        for (const car of city.cars) {
          const L = car.lane, bnd = G.CITY.bound + 30;
          const oldPos = car.pos;
          car.pos += L.dir * car.speed * dt;
          let wrapped = false;
          if (car.pos > bnd) { car.pos = -bnd; wrapped = true; } else if (car.pos < -bnd) { car.pos = bnd; wrapped = true; }
          const lat = L.axis === 'x' ? (L.dir > 0 ? L.off : -L.off) : (L.dir > 0 ? -L.off : L.off);
          const nx = L.axis === 'x' ? car.pos : L.c + lat, nz = L.axis === 'x' ? L.c + lat : car.pos;
          const b = car.box;
          b.dx = wrapped ? 0 : nx - car.x; b.dz = wrapped ? 0 : nz - car.z;
          car.x = nx; car.z = nz;
          b.minX = nx - car.hx; b.maxX = nx + car.hx; b.minZ = nz - car.hz; b.maxZ = nz + car.hz; b.minY = 0; b.maxY = 1.5;
          dummy.position.set(nx, 0, nz); dummy.rotation.set(0, car.rot, 0); dummy.updateMatrix();
          city.carMeshes[car.ci].setMatrixAt(car.idx, dummy.matrix);
        }
        for (const im of city.carMeshes) if (im) im.instanceMatrix.needsUpdate = true;
      };
      city.updateCars(0);

      // --- spawn point: mid-height building close to the centre ---
      let best = null, bd = 1e9;
      for (const b of city.roofs) {
        if (b.h < 60 || b.h > 110 || b.w < 22 || b.d < 22 || (b.i === 0 && b.j === 0)) continue;
        const dd = Math.hypot(b.x - PITCH * 0.5, b.z + PITCH * 0.0);
        if (dd < bd) { bd = dd; best = b; }
      }
      best = best || city.roofs[0];
      city.spawn = { x: best.cx, y: best.h, z: best.cz, building: best };

      city.stats = { buildings: city.buildings.length, verts, colliders: W.boxes.length };
      return city;
    },

    /** Random open spot near a block's sidewalk ring (ground level). */
    sidewalkSpot(rnd, i, j) {
      const ox = i * PITCH, oz = j * PITCH;
      for (let t = 0; t < 20; t++) {
        const side = (rnd() * 4) | 0, k = (rnd() * 2 - 1) * 28, d = 29 + rnd() * 2;
        const x = ox + (side < 2 ? k : (side === 2 ? d : -d)), z = oz + (side < 2 ? (side === 0 ? d : -d) : k);
        if (Math.abs(x) < G.CITY.bound - 5 && Math.abs(z) < G.CITY.bound - 5 && W.pointFree(x, 0, z, 0.5, 1.8)) return { x, y: 0, z };
      }
      return { x: ox + 30, y: 0, z: oz + 30 };
    },

    /** Open spot on a roof top tier (avoids props). */
    roofSpot(b, rnd) {
      const t = b.topBox;
      for (let k = 0; k < 24; k++) {
        const x = t[0] + 2 + rnd() * (t[2] - t[0] - 4), z = t[1] + 2 + rnd() * (t[3] - t[1] - 4);
        if (W.pointFree(x, b.h + 0.01, z, 0.5, 1.8)) return { x, y: b.h, z };
      }
      return { x: b.cx, y: b.h, z: b.cz };
    }
  };
})();
