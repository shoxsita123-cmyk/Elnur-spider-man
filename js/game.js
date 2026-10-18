/* Main game: renderer, sky, lighting, camera, game loop, menus */
(function () {
  'use strict';
  const G = window.G, T = THREE;
  const g = (G.game = {
    state: 'boot', cam: { yaw: 0, pitch: 0.12, dist: 8, effDist: 8, pos: new T.Vector3(), dir: new T.Vector3(0, 0, 1), target: new T.Vector3(), fov: 68, roll: 0, shake: 0 },
    score: 0, scoreShown: 0, hiscore: 0, combo: 0, comboT: 0, boss: null, hitStopT: 0, time: 0, quality: 'high', menuAngle: 0, fps: 60
  });

  const SUN_DIR = new T.Vector3(-0.5, 0.42, -0.75).normalize();
  let renderer, scene, camera, sun, hemi, rim, sky, skyMat, clouds = [], composer, bloomPass, gradePass, canvas;
  let shadowSize = 2048;
  const QUALITY = {
    high: { composer: true, shadow: true, shadowSize: 2048, pr: 1.5 },
    medium: { composer: false, shadow: true, shadowSize: 1024, pr: 1.25 },
    low: { composer: false, shadow: false, shadowSize: 1024, pr: 0.85 }
  };

  // ------------------------------------------------------------------ sky
  const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const SKY_FRAG = [
    'varying vec3 vDir; uniform vec3 uTop, uMid, uHor, uGround, uSunDir, uSunCol;',
    'float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }',
    'void main(){',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.22, h));',
    '  col = mix(col, uTop, smoothstep(0.18, 0.75, h));',
    '  if (h < 0.0) col = mix(uHor, uGround, smoothstep(0.0, -0.25, h));',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.55 + pow(sd, 6.0) * 0.28);',
    '  float st = step(0.9972, hash(floor(d * 260.0))) * smoothstep(0.32, 0.8, h);',
    '  col += vec3(st) * 0.9;',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  function buildSky() {
    skyMat = new T.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new T.Color('#1b2a78') }, uMid: { value: new T.Color('#b2589a') }, uHor: { value: new T.Color('#ff9467') },
        uGround: { value: new T.Color('#3a2a52') }, uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: new T.Color('#ffb070') }
      }
    });
    sky = new T.Mesh(new T.SphereGeometry(2600, 32, 16), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
    // cloud sprites
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 30 + Math.random() * 68, py = 50 + Math.random() * 30, r = 20 + Math.random() * 26;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    }
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const rnd = G.rng(5);
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, rr = 1300 + rnd() * 700, hh = 160 + rnd() * 520;
      const off = new T.Vector3(Math.cos(a) * rr, hh, Math.sin(a) * rr);
      const toSun = Math.max(0, off.clone().normalize().dot(SUN_DIR));
      const col = new T.Color('#7c5aa6').lerp(new T.Color('#ffb48a'), Math.pow(toSun, 0.6));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      sp.scale.set(520 + rnd() * 700, 170 + rnd() * 150, 1);
      sp.userData.off = off; sp.renderOrder = -9;
      scene.add(sp); clouds.push(sp);
    }
  }

  // ------------------------------------------------------------------ renderer / post
  const GRADE = {
    uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uVig: { value: 0.42 }, uExposure: { value: 1.0 }, uSat: { value: 1.12 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uSpeed, uVig, uExposure, uSat; varying vec2 vUv;',
      'vec3 aces(vec3 x){ float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }',
      'void main(){',
      '  vec2 d = vUv - 0.5; vec3 col;',
      '  float ca = 0.0016 + uSpeed * 0.004;',
      '  if (uSpeed > 0.02) {',
      '    col = vec3(0.0); float s = uSpeed * 0.05;',
      '    for (int i = 0; i < 6; i++) { float k = float(i) / 5.0; col += texture2D(tDiffuse, vUv - d * s * k).rgb; }',
      '    col /= 6.0;',
      '  } else col = texture2D(tDiffuse, vUv).rgb;',
      '  col.r = mix(col.r, texture2D(tDiffuse, vUv - d * ca).r, 0.7);',
      '  col.b = mix(col.b, texture2D(tDiffuse, vUv + d * ca).b, 0.7);',
      '  col = aces(col * uExposure);',
      '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
      '  col = mix(vec3(l), col, uSat);',
      '  col *= mix(vec3(0.93, 0.97, 1.08), vec3(1.07, 1.0, 0.93), smoothstep(0.08, 0.75, l));',
      '  float v = smoothstep(0.95, 0.2, length(d * vec2(1.0, 0.92)) * 1.2);',
      '  col *= mix(1.0 - uVig, 1.0, v);',
      '  col = pow(col, vec3(1.0 / 2.2));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  };

  function setupComposer() {
    const w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio();
    const rt = new T.WebGLRenderTarget(w * pr, h * pr, { type: T.HalfFloatType, format: T.RGBAFormat, samples: 4 });
    composer = new T.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new T.RenderPass(scene, camera));
    bloomPass = new T.UnrealBloomPass(new T.Vector2(w / 2, h / 2), 0.62, 0.55, 0.82);
    composer.addPass(bloomPass);
    gradePass = new T.ShaderPass(GRADE);
    composer.addPass(gradePass);
  }

  g.setQuality = function (q) {
    const Q = QUALITY[q] || QUALITY.high;
    g.quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    sun.castShadow = Q.shadow;
    if (Q.shadow && shadowSize !== Q.shadowSize) {
      shadowSize = Q.shadowSize; sun.shadow.mapSize.set(shadowSize, shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    if (Q.composer) {
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(window.innerWidth, window.innerHeight); } else setupComposer();
      renderer.toneMapping = T.NoToneMapping;
      g.useComposer = true;
    } else {
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
      g.useComposer = false;
    }
    G.FX.setScale(renderer.domElement.height, camera.fov);
    const sel = G.$('qualitySel'); if (sel) sel.value = q;
  };

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) { composer.setSize(w, h); }
    G.HUD.resize();
    G.FX.setScale(renderer.domElement.height, camera.fov);
  }

  // ------------------------------------------------------------------ init
  g.init = function () {
    canvas = G.$('game');
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = g.scene = new T.Scene();
    camera = g.camera = new T.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 4200);
    scene.fog = new T.FogExp2(new T.Color('#d98c9c'), 0.00125);
    scene.background = new T.Color('#d98c9c');

    // lights
    hemi = new T.HemisphereLight(new T.Color('#ffb4c0'), new T.Color('#2c3566'), 0.85); scene.add(hemi);
    sun = new T.DirectionalLight(new T.Color('#ffb272'), 2.6);
    sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = sun.shadow.camera; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 720;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
    scene.add(sun); scene.add(sun.target);
    rim = new T.DirectionalLight(new T.Color('#6c86ff'), 0.7); rim.position.set(0.6, 0.35, 0.8); scene.add(rim);

    buildSky();
    // environment lighting from the sky
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), skyMat));
    const pm = new T.PMREMGenerator(renderer);
    const env = pm.fromScene(envScene, 0, 0.1, 200);
    scene.environment = env.texture;
    pm.dispose();

    G.FX.init(scene); G.FX.initBeams(scene);
    g.city = G.City.build(scene, 20240611, renderer);
    g.player = G.createPlayer(scene);
    G.Enemies.init(scene);
    G.Missions.init(scene, g.city);
    G.HUD.init(); G.HUD.buildMinimap(g.city);
    G.Input.attach(canvas);
    G.Input.onLockChange = function (locked) {
      if (!locked && g.state === 'playing') g.pause();
    };
    G.Input.onLockError = function () { G.HUD.toast('Mouse lock unavailable - use the arrow keys to look around', 5); };

    try { g.hiscore = +localStorage.getItem('skylineSwingerBest') || 0; } catch (e) { g.hiscore = 0; }
    wireUI();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => { if (document.hidden && g.state === 'playing') g.pause(); });

    g.setQuality(g.quality);
    resetPlayerToSpawn();
    g.state = 'menu';
    g.menuAngle = 0.6;
    g.last = performance.now();
    requestAnimationFrame(loop);
    const info = G.$('loadInfo'); if (info) info.textContent = 'City ready: ' + g.city.stats.buildings + ' buildings, ' + g.city.stats.colliders + ' colliders';
    G.$('playBtn').disabled = false; G.$('playBtn').textContent = 'START GAME';
  };

  function resetPlayerToSpawn() {
    const s = g.city.spawn, P = g.player;
    const yaw = Math.atan2(-s.x, -s.z);
    P.reset(s.x, s.y, s.z, yaw);
    g.cam.yaw = yaw; g.cam.pitch = 0.1;
    g.cam.target.set(s.x, s.y + 1.5, s.z);
  }

  // ------------------------------------------------------------------ UI wiring
  function show(id, v) { const e = G.$(id); if (e) e.classList.toggle('hidden', !v); }

  function wireUI() {
    G.$('playBtn').addEventListener('click', () => g.start());
    G.$('resumeBtn').addEventListener('click', () => g.resume());
    G.$('retryBtn').addEventListener('click', () => g.respawn());
    G.$('menuBtn').addEventListener('click', () => location.reload());
    G.$('qualitySel').addEventListener('change', (e) => g.setQuality(e.target.value));
    G.$('qualitySel2').addEventListener('change', (e) => g.setQuality(e.target.value));
    const sens = G.$('sensRange'), sens2 = G.$('sensRange2');
    const setS = (v) => { G.Input.sens = 0.0008 + (v / 100) * 0.0042; sens.value = v; sens2.value = v; };
    sens.addEventListener('input', (e) => setS(+e.target.value)); sens2.addEventListener('input', (e) => setS(+e.target.value));
    setS(40);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') { G.Audio.setMuted(!G.Audio.muted); G.HUD.toast(G.Audio.muted ? 'Sound off' : 'Sound on', 1.5); }
      if (e.code === 'KeyP' && g.state === 'playing') document.exitPointerLock();
      if (e.code === 'Enter' && g.state === 'menu') g.start();
    });
  }

  g.start = function () {
    if (g.state !== 'menu') return;
    G.Audio.init();
    resetPlayerToSpawn();
    g.score = 0; g.scoreShown = 0; g.combo = 0;
    G.Missions.reset(); G.Missions.startIndex(0);
    show('menu', false); show('hud', true); show('pause', false); show('gameover', false);
    g.state = 'playing'; g.time = 0; g.hintStep = 0;
    G.Input.enabled = true;
    try { canvas.requestPointerLock(); } catch (e) { /* ignore */ }
    G.HUD.toast('WASD move  •  SHIFT run  •  SPACE jump', 4);
  };

  g.pause = function () {
    if (g.state !== 'playing') return;
    g.state = 'paused'; G.Input.enabled = false; G.Input.lmb = false; show('pause', true);
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
  };
  g.resume = function () {
    if (g.state !== 'paused') return;
    show('pause', false); g.state = 'playing'; G.Input.enabled = true; g.last = performance.now();
    try { canvas.requestPointerLock(); } catch (e) { /* ignore */ }
  };

  g.onPlayerDeath = function () {
    g.state = 'dead'; G.Input.enabled = false; G.Input.lmb = false;
    G.$('finalScore').textContent = Math.floor(g.score).toLocaleString();
    G.$('finalMissions').textContent = G.Missions.completed;
    try { localStorage.setItem('skylineSwingerBest', Math.floor(g.hiscore)); } catch (e) { /* ignore */ }
    setTimeout(() => { if (g.state === 'dead') { show('gameover', true); try { document.exitPointerLock(); } catch (e) { /* ignore */ } } }, 1200);
    G.Audio.play('fail', 1);
  };

  g.respawn = function () {
    show('gameover', false);
    G.Enemies.clear();
    resetPlayerToSpawn();
    g.combo = 0; g.score = Math.floor(g.score * 0.85);
    if (G.Missions.index >= 0) G.Missions.restartCurrent();
    g.state = 'playing'; G.Input.enabled = true; g.last = performance.now();
    try { canvas.requestPointerLock(); } catch (e) { /* ignore */ }
  };

  // ------------------------------------------------------------------ gameplay helpers
  g.comboMult = () => 1 + Math.min(4, Math.floor(g.combo / 4) * 0.5);
  g.registerHit = function () { g.combo++; g.comboT = 3.5; };
  g.addScore = function (n, label) {
    g.score += n;
    const b = g.player.body;
    G.HUD.popup(b.x, b.y + 2.6, b.z, '+' + n + (label ? ' ' + label : ''), '#ffd24a');
    if (g.score > g.hiscore) g.hiscore = g.score;
  };
  g.addKill = function (e) {
    const pts = Math.round(e.score * g.comboMult());
    g.score += pts; if (g.score > g.hiscore) g.hiscore = g.score;
    G.HUD.popup(e.body.x, e.body.y + 2.4, e.body.z, '+' + pts, '#ffd24a');
  };
  g.shake = function (a) { g.cam.shake = Math.min(1, Math.max(g.cam.shake, a)); };
  g.hitStop = function (t) { g.hitStopT = Math.max(g.hitStopT, t); };

  // ------------------------------------------------------------------ camera
  const _F = new T.Vector3(), _R = new T.Vector3(), _O = new T.Vector3(), _hit = {};
  function updateCamera(dt) {
    const c = g.cam, P = g.player, b = P.body, I = G.Input, K = I.keys;
    c.yaw -= I.mdx * I.sens; c.pitch -= I.mdy * I.sens;
    c.yaw += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 2.2 * dt;
    c.pitch += ((K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0)) * 1.6 * dt;
    c.pitch = G.clamp(c.pitch, -1.3, 1.35);
    c.yaw = G.wrapAngle(c.yaw);

    const crouch = P.landT * 0.35;
    c.target.x = G.damp(c.target.x, b.x, 20, dt);
    c.target.y = G.damp(c.target.y, b.y + 1.55 - crouch, 14, dt);
    c.target.z = G.damp(c.target.z, b.z, 20, dt);
    const spd = P.speed;
    const wantD = 7.2 + G.clamp(spd / 45, 0, 1) * 3.2 + (P.state === 'climb' ? 1.2 : 0);
    c.dist = G.damp(c.dist, wantD, 3, dt);

    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    _F.set(sy * cp, sp, cy * cp);
    _R.set(-cy, 0, sy);
    _O.copy(c.target).addScaledVector(_R, 0.95); _O.y += 0.25;
    // camera collision
    let eff = c.dist;
    const back = _F.clone().multiplyScalar(-1);
    const t = G.World.raycast(_O.x, _O.y, _O.z, back.x, back.y, back.z, c.dist + 0.6, _hit, false);
    if (t >= 0) eff = Math.max(0.8, t - 0.6);
    if (eff < c.effDist) c.effDist = eff; else c.effDist = G.damp(c.effDist, eff, 5, dt);
    const px = _O.x - _F.x * c.effDist, pz = _O.z - _F.z * c.effDist;
    let py = _O.y - _F.y * c.effDist;
    if (py < 0.5) py = 0.5;
    c.pos.set(px, py, pz);
    c.dir.copy(_F);

    // shake
    let shx = 0, shy = 0;
    if (c.shake > 0.001) { shx = (Math.random() - 0.5) * c.shake * 0.5; shy = (Math.random() - 0.5) * c.shake * 0.5; c.shake = Math.max(0, c.shake - dt * 2.2); }
    camera.position.set(px + shx, py + shy, pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(_O.x + _F.x * 30, _O.y + _F.y * 30, _O.z + _F.z * 30);
    const lat = b.vx * _R.x + b.vz * _R.z;
    c.roll = G.damp(c.roll, G.clamp(-lat * 0.0045, -0.14, 0.14), 3, dt);
    camera.rotateZ(c.roll);
    const wantFov = 68 + G.clamp(spd - 12, 0, 55) * 0.38;
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = G.damp(camera.fov, wantFov, 4, dt); camera.updateProjectionMatrix(); G.FX.setScale(renderer.domElement.height, camera.fov); }
  }

  function updateMenuCamera(dt) {
    g.menuAngle += dt * 0.07;
    const a = g.menuAngle, R = 300;
    camera.position.set(Math.cos(a) * R, 120 + Math.sin(a * 1.7) * 25, Math.sin(a) * R);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 70, 0);
    g.cam.pos.copy(camera.position);
    camera.fov = 62; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ main step
  let hintT = 0;
  function tutorial(dt) {
    g.time += dt; hintT += dt;
    const P = g.player, H = G.HUD;
    const s = g.hintStep || 0;
    if (s === 0 && g.time > 6) { H.toast('Hold LEFT MOUSE to shoot a web and swing - release to let go', 5); g.hintStep = 1; }
    else if (s === 1 && P.stats.swings > 0 && g.time > 9) { H.toast('While swinging: hold W to pump speed, SHIFT reels the web in, SPACE jumps off', 6); g.hintStep = 2; }
    else if (s === 2 && P.stats.climbs > 0) { H.toast('Climbing! SPACE = wall jump. Reach the top to vault onto the roof', 5); g.hintStep = 3; }
    else if (s === 3 && g.time > 40) { H.toast('F = strike   E = web-shot (stuns)   RIGHT MOUSE = web zip   M = mute', 7); g.hintStep = 4; }
    else if (s === 2 && g.time > 45) { H.toast('Walk into any wall while holding W to climb it', 5); g.hintStep = 3; }
    // world edge warning
    const b = P.body, e = G.CITY.bound - 6;
    if ((Math.abs(b.x) > e || Math.abs(b.z) > e) && hintT > 4) { H.toast('You have reached the edge of the city - turn back!', 3); hintT = 0; }
  }

  g.step = function (dt) {
    if (g.hitStopT > 0) { g.hitStopT -= dt; dt *= 0.06; }
    g.city.updateCars(dt);
    if (g.state === 'playing' || g.state === 'dead') {
      g.player.update(dt);
      G.Enemies.update(dt);
      G.Missions.update(dt);
      if (g.state === 'playing') tutorial(dt);
      g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
      g.scoreShown += (g.score - g.scoreShown) * Math.min(1, dt * 8);
      if (g.score > g.hiscore) g.hiscore = g.score;
      G.Audio.setWind(G.clamp(g.player.speed / 55, 0, 1));
      updateCamera(dt);
      G.HUD.update(dt);
    } else if (g.state === 'menu') {
      updateMenuCamera(dt);
    }
    G.FX.update(dt); G.FX.updateBeams(dt);
    G.Input.endFrame();
  };

  g.syncScene = function (dt) {
    // sun shadow camera follows the camera focus, snapped to texels to avoid shimmering
    const cx = Math.round(g.cam.pos.x / 4) * 4, cz = Math.round(g.cam.pos.z / 4) * 4;
    const fy = g.state === 'menu' ? 40 : Math.round(g.player.body.y / 4) * 4;
    sun.target.position.set(cx, fy, cz);
    sun.position.set(cx + SUN_DIR.x * 300, fy + SUN_DIR.y * 300, cz + SUN_DIR.z * 300);
    sun.target.updateMatrixWorld();
    sky.position.copy(camera.position);
    for (const c of clouds) c.position.copy(camera.position).add(c.userData.off);
    if (gradePass) gradePass.uniforms.uSpeed.value = G.clamp((g.player.speed - 26) / 50, 0, 0.8) * (g.state === 'playing' ? 1 : 0);
  };

  g.render = function (dt) {
    g.syncScene(dt);
    if (g.useComposer) composer.render(dt); else renderer.render(scene, camera);
    if (g.state === 'playing' || g.state === 'dead') G.HUD.draw(dt, camera);
    else G.HUD.draw(0, camera);
  };

  let fpsAcc = 0, fpsN = 0, lowCount = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - g.last) / 1000; g.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    if (g.state === 'playing' || g.state === 'dead' || g.state === 'menu') {
      const n = Math.max(1, Math.ceil(dt / 0.02));
      for (let i = 0; i < n; i++) g.step(dt / n);
    }
    g.render(dt);
    // fps + adaptive quality
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) {
      g.fps = fpsN / fpsAcc;
      const f = G.$('fps'); if (f) f.textContent = Math.round(g.fps) + ' FPS';
      if (g.state === 'playing') {
        if (g.fps < 34) lowCount++; else lowCount = 0;
        if (lowCount >= 6 && g.quality !== 'low') {
          const next = g.quality === 'high' ? 'medium' : 'low';
          g.setQuality(next); lowCount = 0; G.HUD.toast('Low FPS detected - switched graphics to ' + next.toUpperCase(), 4);
        }
      }
      fpsAcc = 0; fpsN = 0;
    }
  }

  window.addEventListener('load', () => {
    try { g.init(); } catch (e) { console.error(e); const i = G.$('loadInfo'); if (i) i.textContent = 'Error: ' + e.message; G.errors.push(e.stack || e.message); }
  });
})();
