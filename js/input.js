/* Keyboard / mouse input */
(function () {
  'use strict';
  const G = window.G;
  const I = (G.Input = {
    keys: {}, pressed: {}, lmb: false, rmb: false, lmbDown: false, lmbUp: false, rmbDown: false,
    mdx: 0, mdy: 0, locked: false, enabled: false, sens: 0.0022
  });
  const BLOCK = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Tab: 1, ShiftLeft: 0 };

  I.attach = function (canvas) {
    window.addEventListener('keydown', (e) => {
      if (BLOCK[e.code]) e.preventDefault();
      if (!e.repeat) I.pressed[e.code] = true;
      I.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { I.keys[e.code] = false; });
    window.addEventListener('blur', () => { I.keys = {}; I.lmb = false; I.rmb = false; });
    window.addEventListener('mousemove', (e) => {
      if (I.locked) { I.mdx += e.movementX || 0; I.mdy += e.movementY || 0; }
    });
    window.addEventListener('mousedown', (e) => {
      if (!I.enabled) return;
      if (e.button === 0) { I.lmb = true; I.lmbDown = true; }
      if (e.button === 2) { I.rmb = true; I.rmbDown = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (I.lmb) I.lmbUp = true; I.lmb = false; }
      if (e.button === 2) I.rmb = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      I.locked = document.pointerLockElement === canvas;
      if (I.onLockChange) I.onLockChange(I.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (I.onLockError) I.onLockError(); });
  };

  I.endFrame = function () {
    I.pressed = {}; I.lmbDown = false; I.lmbUp = false; I.rmbDown = false; I.mdx = 0; I.mdy = 0;
  };
})();
