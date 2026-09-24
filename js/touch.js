'use strict';

// Touch gestures for phones and tablets:
//   drag left/right  -> move one column per step
//   drag down & hold -> soft drop
//   fast swipe down  -> hard drop
//   fast swipe up    -> hold
//   tap              -> rotate (right half clockwise, left half counter-clockwise)
const Touch = (() => {
  const handlers = { tap: [], move: [], hard: [], hold: [], soft: [] };
  const emit = (ev, ...args) => handlers[ev].forEach(f => f(...args));
  const isTouchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  let stepPx = 30;
  let active = null;
  let used = false;

  function find(e) {
    if (!active) return null;
    for (const t of e.changedTouches) if (t.identifier === active.id) return t;
    return null;
  }

  function velocityY(a, now) {
    // Average vertical speed over the last ~120 ms (px/ms)
    const recent = a.samples.filter(s => now - s.t <= 120);
    if (recent.length < 2) return 0;
    const f = recent[0], l = recent[recent.length - 1];
    return (l.y - f.y) / Math.max(1, l.t - f.t);
  }

  function start(e) {
    e.preventDefault();
    used = true;
    if (active) return;
    const t = e.changedTouches[0], now = performance.now();
    active = {
      id: t.identifier, x0: t.clientX, y0: t.clientY, ax: t.clientX,
      t0: now, moved: false, soft: false, samples: [{ y: t.clientY, t: now }],
    };
  }

  function move(e) {
    e.preventDefault();
    const t = find(e);
    if (!t) return;
    const a = active, now = performance.now();
    a.samples.push({ y: t.clientY, t: now });
    if (a.samples.length > 12) a.samples.shift();
    const totalDx = t.clientX - a.x0, totalDy = t.clientY - a.y0;
    if (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 10) a.moved = true;

    const steps = Math.trunc((t.clientX - a.ax) / stepPx);
    if (steps !== 0) {
      for (let i = 0; i < Math.abs(steps); i++) emit('move', Math.sign(steps));
      a.ax += steps * stepPx;
    }
    if (!a.soft && totalDy > stepPx * 1.2 && totalDy > Math.abs(totalDx) * 1.2) {
      a.soft = true;
      emit('soft', true);
    }
  }

  function end(e) {
    e.preventDefault();
    const t = find(e);
    if (!t) return;
    const a = active, now = performance.now();
    active = null;
    if (a.soft) emit('soft', false);
    a.samples.push({ y: t.clientY, t: now });
    const totalDx = t.clientX - a.x0, totalDy = t.clientY - a.y0;
    const vy = velocityY(a, now);
    const quick = now - a.t0 < 280; // a short flick counts regardless of the exact speed
    const vertical = Math.abs(totalDy) > Math.abs(totalDx) * 1.2;
    if (vertical && totalDy > stepPx * 2.5 && (quick || vy > 0.9)) emit('hard');
    else if (vertical && totalDy < -stepPx * 2 && (quick || vy < -0.6)) emit('hold');
    else if (!a.moved && now - a.t0 < 350) emit('tap', t.clientX, t.clientY);
  }

  function cancel() {
    if (active && active.soft) emit('soft', false);
    active = null;
  }

  function attach(el) {
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', cancel, { passive: false });
  }

  return {
    attach,
    on(ev, fn) { handlers[ev].push(fn); },
    set stepPx(v) { stepPx = v; },
    get isTouchDevice() { return isTouchDevice; },
    get used() { return used; },
  };
})();
