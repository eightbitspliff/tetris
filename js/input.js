'use strict';

// Merges keyboard and gamepad (Xbox controller, "standard" mapping) into abstract actions.
//
// Xbox standard mapping:
//   0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 View · 9 Menu/Start
//   12 D-Up · 13 D-Down · 14 D-Left · 15 D-Right · axes[0/1] left stick
const Input = (() => {
  const KEYS = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    soft: ['ArrowDown'],
    hard: ['Space'],
    rotCW: ['ArrowUp', 'KeyX'],
    rotCCW: ['KeyZ', 'KeyY', 'ControlLeft', 'ControlRight'],
    rot180: ['KeyA'],
    hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
    pause: ['Escape', 'KeyP'],
    music: ['KeyM'],
    confirm: ['Enter', 'Space'],
    restart: ['KeyR'],
  };
  const PAD = {
    left: [14],
    right: [15],
    soft: [13],
    hard: [12, 7],
    rotCW: [0],
    rotCCW: [1],
    rot180: [3],
    hold: [2, 4, 5, 6],
    pause: [9],
    music: [8],
    confirm: [0, 9],
    restart: [3],
  };
  const GAME_KEYS = new Set(Object.values(KEYS).flat());

  const keysDown = new Set();
  let cur = {}, prev = {};
  let activePad = -1;
  let padName = null;
  const listeners = { connect: [], disconnect: [] };

  addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keysDown.add(e.code);
  });
  addEventListener('keyup', e => keysDown.delete(e.code));
  addEventListener('blur', () => keysDown.clear());
  addEventListener('gamepadconnected', e => {
    activePad = e.gamepad.index;
    listeners.connect.forEach(f => f(cleanName(e.gamepad.id)));
  });
  addEventListener('gamepaddisconnected', e => {
    if (e.gamepad.index === activePad) activePad = -1;
    listeners.disconnect.forEach(f => f(cleanName(e.gamepad.id)));
  });

  function cleanName(id) {
    const n = (id || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    return n || 'Gamepad';
  }

  function getPads() {
    try { return navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }
    catch (e) { return []; }
  }

  function poll() {
    prev = cur;
    cur = {};
    for (const a in KEYS) cur[a] = KEYS[a].some(k => keysDown.has(k));

    padName = null;
    for (const gp of getPads()) {
      if (!gp || !gp.connected) continue;
      if (padName === null) padName = cleanName(gp.id);
      const btn = i => {
        const b = gp.buttons[i];
        return !!b && (b.pressed || b.value > 0.5);
      };
      let active = false;
      for (const a in PAD) {
        if (PAD[a].some(btn)) { cur[a] = true; active = true; }
      }
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.5) { cur.left = true; active = true; }
      if (ax > 0.5) { cur.right = true; active = true; }
      if (ay > 0.6 && Math.abs(ax) < 0.7) { cur.soft = true; active = true; }
      if (active || activePad < 0) activePad = gp.index;
      if (gp.index === activePad) padName = cleanName(gp.id);
    }
  }

  function rumble(duration, strong, weak) {
    const gp = getPads()[activePad];
    if (!gp) return;
    try {
      const act = gp.vibrationActuator;
      if (act && act.playEffect) {
        const p = act.playEffect(act.type || 'dual-rumble', {
          startDelay: 0, duration, strongMagnitude: strong, weakMagnitude: weak,
        });
        if (p && p.catch) p.catch(() => {});
      } else if (gp.hapticActuators && gp.hapticActuators[0]) {
        gp.hapticActuators[0].pulse(Math.max(strong, weak), duration);
      }
    } catch (e) { /* rumble not supported */ }
  }

  return {
    poll,
    rumble,
    down: a => !!cur[a],
    pressed: a => !!cur[a] && !prev[a],
    // Swallow all presses of the current frame (after a menu transition).
    consume() { prev = Object.assign({}, cur); },
    on(ev, fn) { listeners[ev].push(fn); },
    get padName() { return padName; },
  };
})();
