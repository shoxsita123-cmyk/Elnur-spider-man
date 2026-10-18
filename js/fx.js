/* Visual effects (particles, beams) and procedural audio */
(function () {
  'use strict';
  const G = window.G, T = THREE;

  // ------------------------------------------------------------------ particles
  const CAP = 900;
  const FX = (G.FX = {});
  let pts, posA, colA, sizeA, geo, mat;
  const vel = new Float32Array(CAP * 3), life = new Float32Array(CAP), maxLife = new Float32Array(CAP);
  const grav = new Float32Array(CAP), drag = new Float32Array(CAP), baseA = new Float32Array(CAP), baseS = new Float32Array(CAP), grow = new Float32Array(CAP);
  let next = 0;

  FX.init = function (scene) {
    posA = new Float32Array(CAP * 3); colA = new Float32Array(CAP * 4); sizeA = new Float32Array(CAP);
    geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(posA, 3));
    geo.setAttribute('color', new T.BufferAttribute(colA, 4));
    geo.setAttribute('size', new T.BufferAttribute(sizeA, 1));
    mat = new T.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;\n' +
        'void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); gl_FragColor=vec4(vC.rgb*vC.a*a, 1.0); }'
    });
    mat.blending = T.AdditiveBlending;
    pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    scene.add(pts);
  };

  FX.setScale = function (viewH, fovDeg) {
    if (mat) mat.uniforms.scale.value = viewH / (2 * Math.tan(fovDeg * Math.PI / 360));
  };

  FX.emit = function (x, y, z, vx, vy, vz, r, g, b, a, size, lifeT, gr, dr, gw) {
    const i = next; next = (next + 1) % CAP;
    posA[i * 3] = x; posA[i * 3 + 1] = y; posA[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    colA[i * 4] = r; colA[i * 4 + 1] = g; colA[i * 4 + 2] = b; colA[i * 4 + 3] = a;
    life[i] = maxLife[i] = lifeT; grav[i] = gr || 0; drag[i] = dr || 0; baseA[i] = a; baseS[i] = size; grow[i] = gw || 0;
    sizeA[i] = size;
  };

  /** radial burst */
  FX.burst = function (x, y, z, n, col, speed, size, lifeT, gr) {
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.35 + Math.random() * 0.65);
      FX.emit(x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp,
        col[0], col[1], col[2], 1, size * (0.6 + Math.random() * 0.8), lifeT * (0.6 + Math.random() * 0.6), gr === undefined ? 6 : gr, 1.5);
    }
  };

  FX.update = function (dt) {
    let any = false;
    for (let i = 0; i < CAP; i++) {
      if (life[i] <= 0) { if (sizeA[i] !== 0) { sizeA[i] = 0; any = true; } continue; }
      any = true;
      life[i] -= dt;
      const l = Math.max(0, life[i] / maxLife[i]);
      const dg = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dg; vel[i * 3 + 1] = vel[i * 3 + 1] * dg - grav[i] * dt; vel[i * 3 + 2] *= dg;
      posA[i * 3] += vel[i * 3] * dt; posA[i * 3 + 1] += vel[i * 3 + 1] * dt; posA[i * 3 + 2] += vel[i * 3 + 2] * dt;
      colA[i * 4 + 3] = baseA[i] * l;
      sizeA[i] = life[i] > 0 ? baseS[i] * (grow[i] ? (1 + grow[i] * (1 - l)) : (0.4 + 0.6 * l)) : 0;
    }
    if (any) {
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    }
  };

  // ------------------------------------------------------------------ beams / lines
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
  const cylGeo = new T.CylinderGeometry(1, 1, 1, 6, 1, true);
  FX.makeLine = function (rgb, radius, opacity) {
    const m = new T.MeshBasicMaterial({ transparent: true, opacity: opacity === undefined ? 1 : opacity, depthWrite: false });
    m.color.setRGB(rgb[0], rgb[1], rgb[2]);
    const mesh = new T.Mesh(cylGeo, m);
    mesh.scale.set(radius, 1, radius);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
    return mesh;
  };
  FX.setLine = function (mesh, a, b, radius) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 0.01) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.position.copy(a).addScaledVector(_d, 0.5);
    mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    mesh.scale.set(radius || mesh.scale.x, len, radius || mesh.scale.z);
  };

  const beams = [];
  FX.initBeams = function (scene) {
    for (let i = 0; i < 14; i++) {
      const m = FX.makeLine([1, 1, 1], 0.05, 1); m.userData.t = 0; m.userData.dur = 1; scene.add(m); beams.push(m);
    }
  };
  FX.beam = function (a, b, rgb, radius, dur) {
    let m = beams.find((x) => !x.visible);
    if (!m) m = beams[0];
    m.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
    m.userData.t = dur; m.userData.dur = dur; m.userData.r = radius;
    FX.setLine(m, a, b, radius);
  };
  FX.updateBeams = function (dt) {
    for (const m of beams) {
      if (!m.visible) continue;
      m.userData.t -= dt;
      if (m.userData.t <= 0) { m.visible = false; continue; }
      m.material.opacity = m.userData.t / m.userData.dur;
    }
  };

  // ------------------------------------------------------------------ audio
  const A = (G.Audio = { ctx: null, muted: false });
  let master, noiseBuf, windGain, windFilter, chordTimer = null, arpTimer = null;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (A.ctx = new AC());
      master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.7; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // wind
      const ws = ctx.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      ws.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); ws.start();
      // city hum
      const hs = ctx.createBufferSource(); hs.buffer = noiseBuf; hs.loop = true;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220;
      const hg = ctx.createGain(); hg.gain.value = 0.09;
      hs.connect(hf); hf.connect(hg); hg.connect(master); hs.start();
      A.startMusic();
    } catch (e) { A.ctx = null; }
  };

  A.setMuted = function (m) { A.muted = m; if (master) master.gain.value = m ? 0 : 0.7; };

  A.setWind = function (s01) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    windGain.gain.setTargetAtTime(0.02 + 0.5 * s01 * s01, t, 0.1);
    windFilter.frequency.setTargetAtTime(350 + s01 * 1800, t, 0.1);
  };

  function tone(type, f0, f1, dur, vol, delay) {
    const ctx = A.ctx; if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, ftype, f0, f1, vol, delay) {
    const ctx = A.ctx; if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const SFX = {
    thwip: (v) => { noise(0.16, 'bandpass', 3200, 600, 0.5 * v); tone('sine', 1200, 300, 0.1, 0.12 * v); },
    zip: (v) => { noise(0.35, 'bandpass', 600, 4000, 0.45 * v); tone('sine', 300, 1100, 0.3, 0.1 * v); },
    jump: (v) => { tone('sine', 280, 560, 0.12, 0.12 * v); noise(0.08, 'highpass', 1200, 800, 0.1 * v); },
    land: (v) => { noise(0.18, 'lowpass', 500, 80, 0.55 * v); tone('sine', 90, 40, 0.15, 0.3 * v); },
    punch: (v) => { tone('sine', 190, 45, 0.16, 0.5 * v); noise(0.1, 'lowpass', 1500, 200, 0.4 * v); },
    whiff: (v) => { noise(0.14, 'bandpass', 1800, 700, 0.18 * v); },
    hit: (v) => { tone('square', 240, 70, 0.12, 0.2 * v); noise(0.08, 'lowpass', 2500, 400, 0.3 * v); },
    hurt: (v) => { tone('sawtooth', 230, 55, 0.25, 0.28 * v); noise(0.12, 'lowpass', 900, 120, 0.3 * v); },
    shoot: (v) => { tone('square', 700, 120, 0.12, 0.09 * v); noise(0.06, 'highpass', 3000, 2000, 0.08 * v); },
    plasma: (v) => { tone('sawtooth', 900, 200, 0.2, 0.08 * v); tone('sine', 300, 700, 0.2, 0.08 * v); },
    explode: (v) => { noise(0.7, 'lowpass', 1200, 60, 0.8 * v); tone('sine', 120, 30, 0.5, 0.5 * v); },
    pickup: (v) => { tone('sine', 660, 880, 0.12, 0.2 * v); tone('sine', 990, 1320, 0.15, 0.2 * v, 0.09); },
    ring: (v) => { tone('triangle', 880, 1320, 0.18, 0.22 * v); tone('sine', 1760, 1760, 0.2, 0.1 * v, 0.05); },
    mission: (v) => { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.35, 0.22 * v, i * 0.11)); },
    fail: (v) => { [392, 311, 220].forEach((f, i) => tone('sawtooth', f, f * 0.95, 0.4, 0.14 * v, i * 0.18)); },
    start: (v) => { [330, 440, 660].forEach((f, i) => tone('triangle', f, f, 0.5, 0.2 * v, i * 0.12)); }
  };
  A.play = function (name, vol) { if (!A.ctx || A.muted) return; const f = SFX[name]; if (f) f(vol === undefined ? 1 : vol); };

  const CHORDS = [[110, 165, 220, 262], [87.3, 131, 175, 220], [131, 196, 262, 330], [98, 147, 196, 247]];
  A.startMusic = function () {
    const ctx = A.ctx; if (!ctx || chordTimer) return;
    let ci = 0;
    const play = () => {
      if (A.muted || ctx.state !== 'running') return;
      const ch = CHORDS[ci % CHORDS.length]; ci++;
      const t = ctx.currentTime;
      for (const f of ch) for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 1.8); g.gain.linearRampToValueAtTime(0.0001, t + 6.2);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 6.4);
      }
    };
    play();
    chordTimer = setInterval(play, 4500);
    let ai = 0;
    arpTimer = setInterval(() => {
      if (A.muted || ctx.state !== 'running') return;
      const ch = CHORDS[Math.max(0, ci - 1) % CHORDS.length];
      const f = ch[ai++ % ch.length] * 4;
      tone('triangle', f, f, 0.5, 0.025);
    }, 560);
  };
})();
