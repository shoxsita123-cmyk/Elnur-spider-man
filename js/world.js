/* Collision world: static AABB buildings in a spatial hash + dynamic boxes (cars) */
(function () {
  'use strict';
  const G = window.G;

  // City layout constants
  const PITCH = 86, BLOCK = 64, ROAD = 22, HALF = 5;
  G.CITY = { PITCH, BLOCK, ROAD, HALF, bound: (HALF + 0.5) * PITCH + ROAD / 2 - 3 };

  const CS = 32, OFF = 64, EPS = 1e-4, STEP = 0.6;
  const cells = new Map();
  const boxes = [];
  const dyn = [];
  let stamp = 1;
  const ck = (ix, iz) => (ix + OFF) * 256 + (iz + OFF);

  const World = (G.World = { boxes, dyn });

  World.reset = function () { cells.clear(); boxes.length = 0; dyn.length = 0; };

  World.addBox = function (minX, minY, minZ, maxX, maxY, maxZ, tag) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, tag: tag || '', stamp: 0, dynamic: false, dx: 0, dz: 0 };
    boxes.push(b);
    const x0 = Math.floor(minX / CS), x1 = Math.floor(maxX / CS);
    const z0 = Math.floor(minZ / CS), z1 = Math.floor(maxZ / CS);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = ck(x, z);
        let l = cells.get(k);
        if (!l) { l = []; cells.set(k, l); }
        l.push(b);
      }
    }
    return b;
  };

  World.addDynamic = function (minX, minY, minZ, maxX, maxY, maxZ, tag) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, tag: tag || 'car', stamp: 0, dynamic: true, dx: 0, dz: 0 };
    dyn.push(b);
    return b;
  };

  function gather(x0, z0, x1, z1, out, withDyn) {
    out.length = 0;
    stamp++;
    const ix0 = Math.floor(x0 / CS), ix1 = Math.floor(x1 / CS);
    const iz0 = Math.floor(z0 / CS), iz1 = Math.floor(z1 / CS);
    for (let x = ix0; x <= ix1; x++) {
      for (let z = iz0; z <= iz1; z++) {
        const l = cells.get(ck(x, z));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const b = l[i];
          if (b.stamp !== stamp) { b.stamp = stamp; out.push(b); }
        }
      }
    }
    if (withDyn) for (let i = 0; i < dyn.length; i++) out.push(dyn[i]);
  }
  World.gather = gather;

  function overlap(b, bx) {
    return b.x - b.hw < bx.maxX - EPS && b.x + b.hw > bx.minX + EPS &&
      b.y < bx.maxY - EPS && b.y + b.h > bx.minY + EPS &&
      b.z - b.hw < bx.maxZ - EPS && b.z + b.hw > bx.minZ + EPS;
  }

  const _l = [];
  function anyOverlap(b, list) {
    for (let i = 0; i < list.length; i++) if (overlap(b, list[i])) return true;
    return false;
  }

  function resolve(b, axis, res) {
    gather(b.x - b.hw - 0.05, b.z - b.hw - 0.05, b.x + b.hw + 0.05, b.z + b.hw + 0.05, _l, !b.ignoreDyn);
    for (let i = 0; i < _l.length; i++) {
      const bx = _l[i];
      if (!overlap(b, bx)) continue;
      if (axis === 1) {
        const up = bx.maxY - b.y, dn = (b.y + b.h) - bx.minY;
        if (up <= dn) {
          b.y = bx.maxY;
          if (b.vy < 0) b.vy = 0;
          res.grounded = true; res.groundBox = bx;
        } else {
          b.y = bx.minY - b.h;
          if (b.vy > 0) b.vy = 0;
          res.ceil = true;
        }
      } else {
        // step-up onto small ledges
        const rise = bx.maxY - b.y;
        if (b.stepOK && rise > 0 && rise <= STEP && b.vy <= 0.5) {
          const oy = b.y;
          b.y = bx.maxY;
          if (!anyOverlap(b, _l)) { res.stepped = true; continue; }
          b.y = oy;
        }
        if (axis === 0) {
          const pMin = (b.x + b.hw) - bx.minX, pMax = bx.maxX - (b.x - b.hw);
          if (pMin < pMax) { b.x = bx.minX - b.hw; if (b.vx > 0) b.vx = 0; res.wallNx = -1; }
          else { b.x = bx.maxX + b.hw; if (b.vx < 0) b.vx = 0; res.wallNx = 1; }
          res.wallNz = 0;
        } else {
          const pMin = (b.z + b.hw) - bx.minZ, pMax = bx.maxZ - (b.z - b.hw);
          if (pMin < pMax) { b.z = bx.minZ - b.hw; if (b.vz > 0) b.vz = 0; res.wallNz = -1; }
          else { b.z = bx.maxZ + b.hw; if (b.vz < 0) b.vz = 0; res.wallNz = 1; }
          res.wallNx = 0;
        }
        res.wall = true; res.wallBox = bx;
      }
    }
  }

  World.newResult = () => ({ grounded: false, groundBox: null, wall: false, wallNx: 0, wallNz: 0, wallBox: null, ceil: false, stepped: false, floor: false });

  /** Move a body {x,y,z (feet centre),vx,vy,vz,hw,h} by its velocity with collisions. */
  World.moveBody = function (b, dt, res) {
    res.grounded = false; res.groundBox = null; res.wall = false; res.wallBox = null; res.ceil = false; res.stepped = false; res.floor = false;
    const sp = Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz));
    const steps = Math.max(1, Math.ceil(sp * dt / 0.3));
    const sdt = dt / steps;
    const bound = G.CITY.bound - b.hw;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * sdt; resolve(b, 0, res);
      b.z += b.vz * sdt; resolve(b, 2, res);
      b.y += b.vy * sdt; resolve(b, 1, res);
      if (b.y < 0) { b.y = 0; if (b.vy < 0) b.vy = 0; res.grounded = true; res.groundBox = null; res.floor = true; }
      if (b.x > bound) { b.x = bound; if (b.vx > 0) b.vx = 0; }
      else if (b.x < -bound) { b.x = -bound; if (b.vx < 0) b.vx = 0; }
      if (b.z > bound) { b.z = bound; if (b.vz > 0) b.vz = 0; }
      else if (b.z < -bound) { b.z = -bound; if (b.vz < 0) b.vz = 0; }
    }
    return res;
  };

  World.overlapsAny = function (b) {
    gather(b.x - b.hw, b.z - b.hw, b.x + b.hw, b.z + b.hw, _l, true);
    return anyOverlap(b, _l);
  };

  /** Is a vertical column (cylinder approximated by square) free at x,z from y to y+h? */
  World.pointFree = function (x, y, z, r, h) {
    return !World.overlapsAny({ x, y, z, hw: r, h: h || 1.8 });
  };

  // ---- Ray casting (2D DDA through grid, slab test in 3D) ----
  function rayBox(ox, oy, oz, dx, dy, dz, bx, out) {
    let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
    if (Math.abs(dx) < 1e-9) { if (ox < bx.minX || ox > bx.maxX) return -1; }
    else {
      const inv = 1 / dx; let t1 = (bx.minX - ox) * inv, t2 = (bx.maxX - ox) * inv, n = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < bx.minY || oy > bx.maxY) return -1; }
    else {
      const inv = 1 / dy; let t1 = (bx.minY - oy) * inv, t2 = (bx.maxY - oy) * inv, n = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < bx.minZ || oz > bx.maxZ) return -1; }
    else {
      const inv = 1 / dz; let t1 = (bx.minZ - oz) * inv, t2 = (bx.maxZ - oz) * inv, n = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (tmax < 0 || tmin < 0) return -1;
    out.nx = nx; out.ny = ny; out.nz = nz;
    return tmin;
  }

  const _tmp = { nx: 0, ny: 0, nz: 0 };
  /** Cast a ray (dir must be normalised). Returns hit distance or -1; fills out {x,y,z,nx,ny,nz,box}. */
  World.raycast = function (ox, oy, oz, dx, dy, dz, maxD, out, withDyn) {
    let best = maxD, hitBox = null, hnx = 0, hny = 0, hnz = 0;
    let cx = Math.floor(ox / CS), cz = Math.floor(oz / CS);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(CS / dx) : Infinity, tDZ = dz !== 0 ? Math.abs(CS / dz) : Infinity;
    let tMX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CS - ox : ox - cx * CS) / Math.abs(dx)) : Infinity;
    let tMZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CS - oz : oz - cz * CS) / Math.abs(dz)) : Infinity;
    stamp++;
    for (let guard = 0; guard < 400; guard++) {
      const l = cells.get(ck(cx, cz));
      if (l) {
        for (let i = 0; i < l.length; i++) {
          const b = l[i];
          if (b.stamp === stamp) continue;
          b.stamp = stamp;
          const t = rayBox(ox, oy, oz, dx, dy, dz, b, _tmp);
          if (t >= 0 && t < best) { best = t; hitBox = b; hnx = _tmp.nx; hny = _tmp.ny; hnz = _tmp.nz; }
        }
      }
      const tNext = Math.min(tMX, tMZ);
      if (best <= tNext || tNext > maxD) break;
      if (tMX < tMZ) { cx += stepX; tMX += tDX; } else { cz += stepZ; tMZ += tDZ; }
    }
    if (withDyn) {
      for (let i = 0; i < dyn.length; i++) {
        const t = rayBox(ox, oy, oz, dx, dy, dz, dyn[i], _tmp);
        if (t >= 0 && t < best) { best = t; hitBox = dyn[i]; hnx = _tmp.nx; hny = _tmp.ny; hnz = _tmp.nz; }
      }
    }
    if (!hitBox) return -1;
    if (out) { out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best; out.nx = hnx; out.ny = hny; out.nz = hnz; out.box = hitBox; }
    return best;
  };

  const _ro = {};
  /** True if the straight segment a->b is blocked by static geometry. */
  World.segmentBlocked = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    return World.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, _ro, false) >= 0;
  };

  /** Height of the highest static surface directly below (x,y,z), 0 if only ground. */
  World.groundBelow = function (x, y, z) {
    const t = World.raycast(x, y, z, 0, -1, 0, 1000, _ro, false);
    return t >= 0 ? _ro.y : 0;
  };
})();
