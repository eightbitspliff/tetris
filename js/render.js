'use strict';

// Canvas renderer: neon/synthwave look, pre-rendered glossy block sprites,
// particles, shockwaves, screen shake, animated HUD and overlays.
const FONT = 'Orbitron, "Segoe UI", system-ui, sans-serif';
const PAD_COLORS = { A: '#6cc644', B: '#ee4035', X: '#3b8eea', Y: '#f5c518' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const fmt = n => Math.floor(n).toLocaleString('de-DE');

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, amt) {
  const [r, g, b] = hexRgb(h);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
function rgba(h, a) {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function makeBlockSprite(color, s) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const r = s * 0.16;

  let grad = g.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, shade(color, 0.5));
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, shade(color, -0.5));
  g.fillStyle = grad;
  rr(g, s * 0.04, s * 0.04, s * 0.92, s * 0.92, r);
  g.fill();

  const i = s * 0.17;
  grad = g.createLinearGradient(0, i, 0, s - i);
  grad.addColorStop(0, shade(color, 0.25));
  grad.addColorStop(1, shade(color, -0.2));
  g.fillStyle = grad;
  rr(g, i, i, s - 2 * i, s - 2 * i, r * 0.6);
  g.fill();

  grad = g.createRadialGradient(s * 0.35, s * 0.3, 0, s * 0.35, s * 0.3, s * 0.6);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  rr(g, i, i, s - 2 * i, s - 2 * i, r * 0.6);
  g.fill();

  g.save();
  rr(g, s * 0.04, s * 0.04, s * 0.92, s * 0.92, r);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.beginPath();
  g.ellipse(s * 0.5, s * 0.02, s * 0.75, s * 0.36, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, s * 0.035);
  rr(g, s * 0.06, s * 0.06, s * 0.88, s * 0.88, r);
  g.stroke();

  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(s * 0.27, s * 0.25, s * 0.05, 0, Math.PI * 2);
  g.fill();
  return cv;
}

function makeGlowSprite(color, s) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = s * 3;
  const g = cv.getContext('2d');
  g.shadowColor = color;
  g.shadowBlur = s * 0.9;
  g.fillStyle = color;
  rr(g, s, s, s, s, s * 0.2);
  g.fill();
  g.fill();
  return cv;
}

// 5-row pixel font for the title
const LETTERS = {
  T: ['11111', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  R: ['11110', '10001', '11110', '10100', '10011'],
  I: ['111', '010', '010', '010', '111'],
  S: ['01111', '10000', '01110', '00001', '11110'],
};

class Renderer {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.particles = [];
    this.texts = [];
    this.trails = [];
    this.rings = [];
    this.beams = [];
    this.lockFx = [];
    this.toasts = [];
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.hue = 200;
    this.displayScore = 0;
    this.gameOverT = 0;
    this.levelPulse = 0;
    this.stars = Array.from({ length: 170 }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2, p: Math.random() * 6.28,
    }));
    this.floaters = Array.from({ length: 9 }, () => this.newFloater(true));
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  newFloater(init) {
    return {
      type: TYPES[(Math.random() * 7) | 0],
      x: Math.random(),
      y: init ? Math.random() * 1.2 : 1.25,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.0005,
      vy: 0.000015 + Math.random() * 0.00003,
      s: 0.6 + Math.random() * 1.3,
      a: 0.05 + Math.random() * 0.08,
    };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = innerWidth;
    this.H = innerHeight;
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    const cell = Math.max(8, Math.floor(Math.min(this.W / 23.5, this.H / (ROWS + 3.2))));
    this.cell = cell;
    this.bw = cell * COLS;
    this.bh = cell * ROWS;
    this.bx = Math.round((this.W - this.bw) / 2);
    this.by = Math.round((this.H - this.bh) / 2 + cell * 0.2);
    this.panelW = cell * 5.2;
    this.gap = cell * 0.9;
    this.lx = this.bx - this.gap - this.panelW;
    this.rx = this.bx + this.bw + this.gap;
    const px = Math.ceil(Math.max(cell, 40) * dpr);
    this.sprites = {};
    this.glows = {};
    for (const t of TYPES) {
      this.sprites[t] = makeBlockSprite(COLORS[t], px);
      this.glows[t] = makeGlowSprite(COLORS[t], Math.ceil(px / 2));
    }
    this.sprites.G = makeBlockSprite('#596073', px);
    this.sprites.W = makeBlockSprite('#ffffff', px);
  }

  rowY(r) { return this.by + (r - HIDDEN) * this.cell; }
  colX(c) { return this.bx + c * this.cell; }
  get accent() { return `hsl(${this.hue},100%,62%)`; }

  // ---------- Effect triggers ----------
  toast(text, color = '#fff') {
    this.toasts = this.toasts.filter(t => t.text !== text);
    this.toasts.push({ text, color, t: 0, dur: 2600 });
  }

  onHardDrop({ type, from, to, dist }) {
    const cell = this.cell, col = COLORS[type];
    const cols = {};
    to.forEach((c, i) => {
      const f = from[i];
      const e = cols[c.x] || (cols[c.x] = { top: f.y, bottom: c.y });
      e.top = Math.min(e.top, f.y);
      e.bottom = Math.max(e.bottom, c.y);
    });
    if (dist > 0) {
      for (const x in cols) {
        this.trails.push({
          x: this.colX(+x), y0: this.rowY(cols[x].top), y1: this.rowY(cols[x].bottom) + cell,
          color: col, t: 0, dur: 320,
        });
      }
    }
    // Dust at the landing edge
    const bottom = {};
    to.forEach(c => { bottom[c.x] = Math.max(bottom[c.x] || -1, c.y); });
    for (const x in bottom) {
      const px = this.colX(+x) + cell / 2, py = this.rowY(bottom[x]) + cell;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + Math.random() * Math.PI;
        const sp = (0.05 + Math.random() * 0.25) * cell / 40;
        this.particles.push({
          x: px + (Math.random() - 0.5) * cell, y: py, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp,
          g: 0.0006 * cell / 40, drag: 0.93, life: 400, max: 400, color: col, size: cell * 0.09, spark: false,
        });
      }
    }
    this.shake = Math.max(this.shake, 3 + Math.min(dist, 20) * 0.28);
  }

  onLock({ cells }) {
    this.lockFx.push({ cells, t: 0, dur: 220 });
  }

  onClear({ rows, n, tspin, cells }) {
    const cell = this.cell, s = cell / 40;
    const centerX = this.bx + this.bw / 2;
    for (const c of cells) {
      const cx = this.colX(c.x) + cell / 2, cy = this.rowY(c.y) + cell / 2;
      const count = n === 4 ? 11 : 6 + n;
      const col = COLORS[c.type] || '#fff';
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.08 + Math.random() * (n === 4 ? 0.7 : 0.45)) * s;
        const life = 700 + Math.random() * 700;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * cell * 0.8, y: cy + (Math.random() - 0.5) * cell * 0.8,
          vx: Math.cos(a) * sp + (cx - centerX) * 0.0008, vy: Math.sin(a) * sp - 0.18 * s,
          g: 0.0011 * s, drag: 0.975, life, max: life, color: col,
          size: cell * (0.07 + Math.random() * 0.16), spark: Math.random() < 0.35,
        });
      }
    }
    for (const r of rows) {
      this.beams.push({ y: this.rowY(r) + cell / 2, t: 0, dur: 520, strong: n === 4 || !!tspin });
    }
    const midY = rows.reduce((a, r) => a + this.rowY(r), 0) / rows.length + cell / 2;
    this.rings.push({ x: centerX, y: midY, max: this.bw * (n === 4 ? 1.6 : 0.9), t: 0, dur: 650, color: n === 4 ? '#ffffff' : this.accent });
    if (n === 4) this.rings.push({ x: centerX, y: midY, max: this.bw * 2.4, t: -120, dur: 900, color: this.accent });
    this.shake = Math.max(this.shake, n === 4 ? 16 : 3 + n * 2.5);
    this.flash = Math.max(this.flash, n === 4 ? 0.35 : tspin ? 0.2 : 0.06 * n);
  }

  onText({ label, b2b, combo, pts, perfect, tspin, n }) {
    const cell = this.cell;
    const lines = [];
    if (b2b) lines.push({ str: 'BACK-TO-BACK', size: cell * 0.45, color: '#ffe03a' });
    if (label) {
      const big = label === 'TETRIS' || perfect;
      lines.push({
        str: label, size: cell * (big ? 1.25 : label.length > 12 ? 0.62 : 0.8),
        color: tspin ? COLORS.T : perfect ? '#ffffff' : this.accent, rainbow: big,
      });
    }
    if (combo > 0) lines.push({ str: `${combo} COMBO`, size: cell * 0.55, color: '#3dff72' });
    if (pts > 0) lines.push({ str: '+' + fmt(pts), size: cell * 0.45, color: '#ffffff' });
    if (!lines.length) return;
    const busy = this.texts.filter(t => t.t < 600).length;
    this.texts.push({
      lines, x: this.bx + this.bw / 2, y: this.by + this.bh * 0.38 + busy * cell * 2.4,
      t: 0, dur: perfect || n === 4 ? 2000 : 1500,
    });
  }

  onLevelUp(level) {
    const cell = this.cell;
    this.levelPulse = 1;
    this.flash = Math.max(this.flash, 0.25);
    this.texts.push({
      lines: [
        { str: 'LEVEL UP', size: cell * 0.5, color: '#ffffff' },
        { str: String(level), size: cell * 1.8, color: this.accent, rainbow: true },
      ],
      x: this.bx + this.bw / 2, y: this.by + this.bh * 0.62, t: 0, dur: 1800,
    });
    for (let i = 0; i < 3; i++) {
      this.rings.push({ x: this.bx + this.bw / 2, y: this.by + this.bh / 2, max: Math.max(this.W, this.H) * 0.8, t: -i * 150, dur: 1100, color: '#ffffff' });
    }
  }

  onGameOver() {
    this.gameOverT = 0;
    this.shake = 20;
    this.flash = 0.5;
  }

  reset() {
    this.particles = [];
    this.texts = [];
    this.trails = [];
    this.rings = [];
    this.beams = [];
    this.lockFx = [];
    this.displayScore = 0;
    this.gameOverT = 0;
  }

  // ---------- Update ----------
  update(dt) {
    const g = this.game;
    this.time += dt;
    const targetHue = (200 + (g.level - 1) * 47) % 360;
    const dh = ((targetHue - this.hue + 540) % 360) - 180;
    this.hue = (this.hue + dh * Math.min(1, dt * 0.003) + 360) % 360;

    this.displayScore += (g.score - this.displayScore) * Math.min(1, dt * 0.01);
    if (Math.abs(g.score - this.displayScore) < 1) this.displayScore = g.score;

    const f = dt / 16.67;
    this.shake *= Math.pow(0.88, f);
    if (this.shake < 0.15) this.shake = 0;
    this.flash *= Math.pow(0.9, f);
    this.levelPulse = Math.max(0, this.levelPulse - dt / 1500);
    if (g.state === 'gameover') this.gameOverT += dt;

    for (const p of this.particles) {
      p.life -= dt;
      const d = Math.pow(p.drag, f);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 2500) this.particles.splice(0, this.particles.length - 2500);

    for (const list of ['trails', 'rings', 'beams', 'lockFx', 'texts', 'toasts']) {
      for (const e of this[list]) e.t += dt;
      this[list] = this[list].filter(e => e.t < e.dur);
    }

    for (const s of this.stars) {
      s.y += s.z * dt * 0.000012 * (1 + (g.level - 1) * 0.15);
      if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
    }
    for (let i = 0; i < this.floaters.length; i++) {
      const fl = this.floaters[i];
      fl.y -= fl.vy * dt;
      fl.rot += fl.vr * dt;
      if (fl.y < -0.25) this.floaters[i] = this.newFloater(false);
    }
  }

  // ---------- Drawing ----------
  draw() {
    const c = this.ctx, g = this.game;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.drawBackground();

    if (g.state === 'menu') {
      this.drawMenu();
    } else {
      c.save();
      c.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
      this.drawBoard();
      this.drawPanels();
      this.drawEffects();
      c.restore();
      if (g.state === 'paused') this.drawPause();
      if (g.state === 'gameover') this.drawGameOver();
    }

    if (this.flash > 0.01) {
      c.fillStyle = `rgba(255,255,255,${this.flash})`;
      c.fillRect(0, 0, this.W, this.H);
    }
    this.drawStatus();
    this.drawToasts();
  }

  text(str, x, y, o = {}) {
    const c = this.ctx;
    const { size = 16, weight = 700, color = '#fff', align = 'center', base = 'middle', glow = 0, alpha = 1, spacing = 0 } = o;
    c.save();
    c.globalAlpha *= alpha;
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = base;
    if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
    if (glow) { c.shadowColor = typeof glow === 'string' ? glow : color; c.shadowBlur = size * 0.6; }
    c.fillStyle = color;
    c.fillText(str, x, y);
    if (glow) { c.shadowBlur = 0; c.fillText(str, x, y); }
    c.restore();
  }

  measure(str, size, weight = 700) {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${FONT}`;
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    return c.measureText(str).width;
  }

  drawBackground() {
    const c = this.ctx, W = this.W, H = this.H, h = this.hue, t = this.time;
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${h},70%,6%)`);
    g.addColorStop(0.65, `hsl(${(h + 40) % 360},60%,4%)`);
    g.addColorStop(1, `hsl(${(h + 80) % 360},70%,9%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ox = W * (0.5 + 0.4 * Math.sin(t * 0.00011 * (i + 1) + i * 2));
      const oy = H * (0.4 + 0.3 * Math.cos(t * 0.00013 * (i + 1) + i));
      const rad = Math.max(W, H) * (0.35 + 0.1 * i);
      const rg = c.createRadialGradient(ox, oy, 0, ox, oy, rad);
      rg.addColorStop(0, `hsla(${(h + i * 70) % 360},90%,50%,0.11)`);
      rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    }
    for (const s of this.stars) {
      const a = (0.3 + 0.7 * Math.abs(Math.sin(t * 0.0015 * s.z + s.p))) * s.z;
      c.fillStyle = `rgba(255,255,255,${a})`;
      const sz = s.z * 2;
      c.fillRect(s.x * W, s.y * H, sz, sz);
    }
    c.globalCompositeOperation = 'source-over';

    // Synthwave sun + perspective grid
    const hor = H * 0.72, gh = (h + 300) % 360;
    const sg = c.createRadialGradient(W / 2, hor, 0, W / 2, hor, W * 0.5);
    sg.addColorStop(0, `hsla(${gh},100%,60%,0.28)`);
    sg.addColorStop(1, `hsla(${gh},100%,60%,0)`);
    c.fillStyle = sg;
    c.fillRect(0, hor - W * 0.5, W, W);

    c.save();
    c.beginPath();
    c.rect(0, hor, W, H - hor);
    c.clip();
    const floor = c.createLinearGradient(0, hor, 0, H);
    floor.addColorStop(0, `hsla(${gh},80%,10%,0.2)`);
    floor.addColorStop(1, `hsla(${gh},80%,4%,0.7)`);
    c.fillStyle = floor;
    c.fillRect(0, hor, W, H - hor);
    const lg = c.createLinearGradient(0, hor, 0, H);
    lg.addColorStop(0, `hsla(${gh},100%,65%,0)`);
    lg.addColorStop(1, `hsla(${gh},100%,65%,0.6)`);
    c.strokeStyle = lg;
    c.lineWidth = 1.5;
    c.beginPath();
    const vx = W / 2;
    for (let i = -24; i <= 24; i++) {
      c.moveTo(vx + i * W * 0.004, hor);
      c.lineTo(vx + i * W * 0.1, H);
    }
    const off = (t * 0.00045 * (1 + (this.game.level - 1) * 0.1)) % 1;
    for (let i = 0; i < 30; i++) {
      const d = i + 1 - off;
      const y = hor + (H - hor) * 0.9 / d;
      if (y <= hor + 1) continue;
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    c.restore();
    c.fillStyle = `hsla(${gh},100%,72%,0.55)`;
    c.fillRect(0, hor - 1, W, 2);

    // Drifting tetrominoes
    const cell = this.cell;
    for (const f of this.floaters) {
      const m = MATRICES[f.type][0];
      const s = cell * f.s, n = m.length;
      c.save();
      c.globalAlpha = f.a;
      c.translate(f.x * W, f.y * H);
      c.rotate(f.rot);
      for (let r = 0; r < n; r++)
        for (let k = 0; k < n; k++)
          if (m[r][k]) c.drawImage(this.sprites[f.type], (k - n / 2) * s, (r - n / 2) * s, s, s);
      c.restore();
    }
  }

  dangerous() {
    const b = this.game.board;
    for (let r = HIDDEN; r < HIDDEN + 4; r++) if (b[r].some(Boolean)) return true;
    return false;
  }

  drawBoard() {
    const c = this.ctx, g = this.game, { bx, by, bw, bh, cell } = this;
    const danger = g.state === 'playing' && this.dangerous();
    const pad = cell * 0.18;

    c.save();
    c.shadowColor = danger ? 'rgba(255,40,70,0.95)' : this.accent;
    c.shadowBlur = cell * (0.8 + this.levelPulse * 1.5);
    rr(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, cell * 0.3);
    c.fillStyle = 'rgba(4,6,18,0.84)';
    c.fill();
    c.restore();
    c.lineWidth = 2;
    c.strokeStyle = danger
      ? `rgba(255,60,90,${0.6 + 0.4 * Math.sin(this.time * 0.012)})`
      : `hsla(${this.hue},100%,68%,0.9)`;
    rr(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, cell * 0.3);
    c.stroke();

    // Inner sheen + grid
    const sheen = c.createLinearGradient(0, by, 0, by + bh);
    sheen.addColorStop(0, `hsla(${this.hue},100%,60%,0.07)`);
    sheen.addColorStop(1, `hsla(${(this.hue + 60) % 360},100%,60%,0.02)`);
    c.fillStyle = sheen;
    c.fillRect(bx, by, bw, bh);
    if (danger) {
      const dg = c.createLinearGradient(0, by, 0, by + bh * 0.4);
      dg.addColorStop(0, `rgba(255,30,60,${0.18 + 0.1 * Math.sin(this.time * 0.01)})`);
      dg.addColorStop(1, 'rgba(255,30,60,0)');
      c.fillStyle = dg;
      c.fillRect(bx, by, bw, bh * 0.4);
    }
    c.strokeStyle = 'rgba(255,255,255,0.045)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < COLS; x++) { c.moveTo(bx + x * cell + 0.5, by); c.lineTo(bx + x * cell + 0.5, by + bh); }
    for (let y = 1; y < ROWS; y++) { c.moveTo(bx, by + y * cell + 0.5); c.lineTo(bx + bw, by + y * cell + 0.5); }
    c.stroke();

    c.save();
    c.beginPath();
    c.rect(bx - pad, by - cell * 2, bw + pad * 2, bh + cell * 2 + pad);
    c.clip();

    // Locked cells
    const clearSet = g.clearing ? new Set(g.clearing.rows) : null;
    const cp = g.clearing ? g.clearing.t / g.clearing.dur : 0;
    const greyRows = g.state === 'gameover' ? Math.floor(this.gameOverT / 1000 * TOTAL) : -1;
    for (let r = 0; r < TOTAL; r++) {
      const y = this.rowY(r);
      const grey = greyRows >= 0 && TOTAL - 1 - r < greyRows;
      for (let x = 0; x < COLS; x++) {
        const t = g.board[r][x];
        if (!t) continue;
        if (clearSet && clearSet.has(r)) { this.drawClearingCell(x, r, t, cp); continue; }
        c.drawImage(grey ? this.sprites.G : this.sprites[t], bx + x * cell, y, cell, cell);
      }
    }

    if (g.piece && g.state !== 'gameover') this.drawActivePiece();
    c.restore();
  }

  drawClearingCell(x, r, t, p) {
    const c = this.ctx, cell = this.cell;
    const cx = this.colX(x) + cell / 2, cy = this.rowY(r) + cell / 2;
    const delay = Math.abs(x - 4.5) / 4.5 * 0.25;
    const k = clamp((p - 0.2 - delay) / 0.5, 0, 1);
    const s = 1 - easeOutCubic(k);
    if (s <= 0.01) return;
    const sz = cell * (1 + (p < 0.2 ? p : 0) * 0.5) * s;
    c.drawImage(this.sprites[t], cx - sz / 2, cy - sz / 2, sz, sz);
    c.globalAlpha = p < 0.2 ? p / 0.2 : 1 - k;
    c.drawImage(this.sprites.W, cx - sz / 2, cy - sz / 2, sz, sz);
    c.globalAlpha = 1;
  }

  drawActivePiece() {
    const c = this.ctx, g = this.game, p = g.piece, cell = this.cell;
    const col = COLORS[p.type];
    const cells = g.cellsOf(p);
    const gy = g.ghostY();
    const ghost = g.cellsOf(p, gy);

    // Light beam between piece and ghost
    const xs = cells.map(q => q.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const topY = this.rowY(Math.min(...cells.map(q => q.y)));
    const botY = this.rowY(Math.max(...ghost.map(q => q.y))) + cell;
    const beam = c.createLinearGradient(0, topY, 0, botY);
    beam.addColorStop(0, rgba(col, 0));
    beam.addColorStop(1, rgba(col, 0.13));
    c.fillStyle = beam;
    c.fillRect(this.colX(minX), topY, (maxX - minX + 1) * cell, botY - topY);

    // Ghost
    if (gy !== p.y) {
      for (const q of ghost) {
        const X = this.colX(q.x), Y = this.rowY(q.y);
        rr(c, X + 2, Y + 2, cell - 4, cell - 4, cell * 0.15);
        c.fillStyle = rgba(col, 0.12);
        c.fill();
        c.strokeStyle = rgba(col, 0.7);
        c.lineWidth = 2;
        c.stroke();
      }
    }

    // Glow + blocks
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.45 + 0.15 * Math.sin(this.time * 0.006);
    for (const q of cells) c.drawImage(this.glows[p.type], this.colX(q.x) - cell, this.rowY(q.y) - cell, cell * 3, cell * 3);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    for (const q of cells) c.drawImage(this.sprites[p.type], this.colX(q.x), this.rowY(q.y), cell, cell);

    const lp = g.lockProgress;
    if (lp > 0) {
      c.globalAlpha = lp * 0.55;
      for (const q of cells) c.drawImage(this.sprites.W, this.colX(q.x), this.rowY(q.y), cell, cell);
      c.globalAlpha = 1;
    }
  }

  drawEffects() {
    const c = this.ctx, cell = this.cell;
    c.globalCompositeOperation = 'lighter';

    for (const tr of this.trails) {
      const a = 1 - tr.t / tr.dur;
      const gr = c.createLinearGradient(0, tr.y0, 0, tr.y1);
      gr.addColorStop(0, rgba(tr.color, 0));
      gr.addColorStop(1, rgba(tr.color, 0.6 * a));
      c.fillStyle = gr;
      const w = cell * (0.85 - 0.4 * (tr.t / tr.dur));
      c.fillRect(tr.x + (cell - w) / 2, tr.y0, w, tr.y1 - tr.y0);
    }

    for (const lf of this.lockFx) {
      c.globalAlpha = (1 - lf.t / lf.dur) * 0.6;
      for (const q of lf.cells) {
        if (q.y < 0) continue;
        c.drawImage(this.sprites.W, this.colX(q.x), this.rowY(q.y), cell, cell);
      }
    }
    c.globalAlpha = 1;

    for (const b of this.beams) {
      const k = b.t / b.dur;
      const ext = this.bw * (0.1 + easeOutCubic(k) * (b.strong ? 1.6 : 0.8));
      const hgt = cell * (b.strong ? 1.1 : 0.8) * (1 - k * 0.8);
      const gr = c.createLinearGradient(this.bx - ext, 0, this.bx + this.bw + ext, 0);
      const a = (1 - k) * 0.9;
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.3, `hsla(${this.hue},100%,70%,${a * 0.6})`);
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.7, `hsla(${this.hue},100%,70%,${a * 0.6})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(this.bx - ext, b.y - hgt / 2, this.bw + ext * 2, hgt);
    }

    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.dur;
      c.strokeStyle = r.color;
      c.globalAlpha = (1 - k) * 0.8;
      c.lineWidth = cell * 0.35 * (1 - k) + 1;
      c.beginPath();
      c.arc(r.x, r.y, r.max * easeOutCubic(k), 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;

    for (const p of this.particles) {
      const a = p.life / p.max;
      c.globalAlpha = a;
      if (p.spark) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1, p.size * 0.35);
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 28, p.y - p.vy * 28);
        c.stroke();
      } else {
        const s = p.size * (0.4 + 0.6 * a);
        c.fillStyle = p.color;
        c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    for (const tx of this.texts) this.drawFloatingText(tx);
  }

  drawFloatingText(tx) {
    const c = this.ctx, cell = this.cell;
    const k = tx.t / tx.dur;
    const pop = easeOutBack(clamp(tx.t / 280, 0, 1));
    const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const rise = -cell * 1.4 * easeOutCubic(k);
    c.save();
    c.translate(tx.x, tx.y + rise);
    c.scale(pop, pop);
    c.globalAlpha = alpha;
    let y = 0;
    for (const l of tx.lines) {
      c.font = `900 ${l.size}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if ('letterSpacing' in c) c.letterSpacing = '2px';
      let fill = l.color;
      if (l.rainbow) {
        const w = c.measureText(l.str).width / 2;
        const gr = c.createLinearGradient(-w, 0, w, 0);
        const order = ['Z', 'L', 'O', 'S', 'I', 'J', 'T'];
        const shift = (this.time * 0.0006) % 1;
        order.forEach((t, i) => gr.addColorStop(((i / 6) + shift) % 1, COLORS[t]));
        fill = gr;
      }
      c.shadowColor = l.rainbow ? '#ffffff' : l.color;
      c.shadowBlur = l.size * 0.5;
      c.lineWidth = Math.max(2, l.size * 0.08);
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(l.str, 0, y);
      c.fillStyle = fill;
      c.fillText(l.str, 0, y);
      c.shadowBlur = 0;
      c.fillText(l.str, 0, y);
      y += l.size * 1.15;
    }
    c.restore();
  }

  panel(x, y, w, h, title) {
    const c = this.ctx, cell = this.cell;
    rr(c, x, y, w, h, cell * 0.25);
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(14,18,40,0.8)');
    gr.addColorStop(1, 'rgba(6,8,22,0.8)');
    c.fillStyle = gr;
    c.fill();
    c.strokeStyle = `hsla(${this.hue},100%,70%,0.45)`;
    c.lineWidth = 1.5;
    c.stroke();
    if (title) {
      c.fillStyle = `hsla(${this.hue},100%,65%,0.9)`;
      c.fillRect(x + cell * 0.35, y + cell * 0.72, cell * 0.12, cell * 0.12);
      this.text(title, x + cell * 0.6, y + cell * 0.8, { size: cell * 0.36, align: 'left', color: '#dfe6ff', spacing: 3 });
    }
  }

  drawMini(type, cx, cy, s, alpha = 1, glow = false) {
    const c = this.ctx, m = MATRICES[type][0];
    let minR = 9, maxR = -1, minC = 9, maxC = -1;
    m.forEach((row, r) => row.forEach((v, k) => {
      if (!v) return;
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, k); maxC = Math.max(maxC, k);
    }));
    const x0 = cx - (maxC - minC + 1) * s / 2, y0 = cy - (maxR - minR + 1) * s / 2;
    c.globalAlpha = alpha;
    if (glow) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * (0.35 + 0.1 * Math.sin(this.time * 0.005));
      m.forEach((row, r) => row.forEach((v, k) => {
        if (v) c.drawImage(this.glows[type], x0 + (k - minC) * s - s, y0 + (r - minR) * s - s, s * 3, s * 3);
      }));
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
    }
    const spr = alpha < 0.5 ? this.sprites.G : this.sprites[type];
    m.forEach((row, r) => row.forEach((v, k) => {
      if (v) c.drawImage(spr, x0 + (k - minC) * s, y0 + (r - minR) * s, s, s);
    }));
    c.globalAlpha = 1;
  }

  drawPanels() {
    const g = this.game, cell = this.cell, c = this.ctx;
    const lx = this.lx, rx = this.rx, pw = this.panelW, by = this.by;

    // HOLD
    this.panel(lx, by, pw, cell * 3.6, 'HOLD');
    if (g.hold) this.drawMini(g.hold, lx + pw / 2, by + cell * 2.25, cell * 0.85, g.canHold ? 1 : 0.35, false);

    // STATS
    const sy = by + cell * 4.3, sh = this.bh - cell * 4.3;
    this.panel(lx, sy, pw, sh, null);
    const pad = cell * 0.45;
    let y = sy + cell * 0.75;
    const stat = (label, value, color = '#ffffff', big = false) => {
      this.text(label, lx + pad, y, { size: cell * 0.3, align: 'left', color: 'rgba(200,210,255,0.7)', spacing: 2 });
      y += cell * (big ? 0.85 : 0.72);
      this.text(value, lx + pad, y, { size: cell * (big ? 0.66 : 0.52), align: 'left', color, glow: big ? color : 0, weight: 900 });
      y += cell * (big ? 1.0 : 0.85);
    };
    stat('SCORE', fmt(this.displayScore), '#ffffff', true);
    stat('REKORD', fmt(Math.max(g.highscore, g.score)), '#ffe03a');
    stat('LEVEL', String(g.level), this.accent, true);
    // level progress bar
    const barW = pw - pad * 2, prog = (g.lines % 10) / 10;
    rr(c, lx + pad, y - cell * 0.55, barW, cell * 0.18, cell * 0.09);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    if (prog > 0) {
      rr(c, lx + pad, y - cell * 0.55, barW * prog, cell * 0.18, cell * 0.09);
      c.fillStyle = this.accent;
      c.fill();
    }
    y += cell * 0.1;
    stat('LINES', String(g.lines));
    const secs = Math.floor(g.stats.time / 1000);
    stat('ZEIT', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    if (y < sy + sh - cell * 1.4) stat('TETRIS', String(g.stats.tetrises), COLORS.I);
    if (y < sy + sh - cell * 1.4) stat('T-SPINS', String(g.stats.tspins), COLORS.T);

    // NEXT
    const nh = cell * 13.2;
    this.panel(rx, by, pw, nh, 'NEXT');
    if (g.queue.length) {
      this.drawMini(g.queue[0], rx + pw / 2, by + cell * 2.5, cell * 0.95, 1, true);
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      c.beginPath();
      c.moveTo(rx + cell * 0.5, by + cell * 4.1);
      c.lineTo(rx + pw - cell * 0.5, by + cell * 4.1);
      c.stroke();
      for (let i = 1; i < 5; i++) {
        this.drawMini(g.queue[i], rx + pw / 2, by + cell * (5.3 + (i - 1) * 2.2), cell * 0.68, 1 - i * 0.12);
      }
    }

    // Controls
    const cy0 = by + cell * 13.9, chh = this.bh - cell * 13.9;
    this.panel(rx, cy0, pw, chh, 'STEUERUNG');
    const rows = [
      [['DL', 'DR'], 'Bewegen'],
      [['DD'], 'Soft Drop'],
      [['DU', 'RT'], 'Hard Drop'],
      [['A', 'B'], 'Drehen'],
      [['Y'], '180°'],
      [['X', 'LB'], 'Halten'],
      [['START'], 'Pause'],
    ];
    const rh = Math.min(cell * 0.66, (chh - cell * 1.3) / rows.length);
    let ry = cy0 + cell * 1.45;
    for (const [btns, label] of rows) {
      if (ry > cy0 + chh - rh * 0.4) break;
      let x = rx + cell * 0.4;
      for (const b of btns) x += this.btn(b, x, ry, rh * 0.78) + rh * 0.15;
      this.text(label, rx + pw - cell * 0.35, ry, { size: rh * 0.42, align: 'right', color: 'rgba(225,232,255,0.85)', weight: 500 });
      ry += rh;
    }
  }

  // Draws a controller button glyph, x = left edge, y = vertical center. Returns its width.
  btn(label, x, y, h) {
    const c = this.ctx;
    if (PAD_COLORS[label]) {
      const r = h / 2;
      c.beginPath();
      c.arc(x + r, y, r, 0, Math.PI * 2);
      c.fillStyle = '#161922';
      c.fill();
      c.strokeStyle = PAD_COLORS[label];
      c.lineWidth = Math.max(1.5, h * 0.08);
      c.stroke();
      this.text(label, x + r, y + h * 0.03, { size: h * 0.58, color: PAD_COLORS[label], weight: 900 });
      return h;
    }
    if (label[0] === 'D' && label.length === 2) {
      // D-pad with highlighted direction
      const s = h, u = s / 3;
      const cx = x + s / 2;
      c.fillStyle = '#3a4050';
      c.fillRect(cx - u / 2, y - s / 2, u, s);
      c.fillRect(x, y - u / 2, s, u);
      c.fillStyle = '#ffffff';
      const d = label[1];
      if (d === 'U') c.fillRect(cx - u / 2, y - s / 2, u, u);
      if (d === 'D') c.fillRect(cx - u / 2, y + s / 2 - u, u, u);
      if (d === 'L') c.fillRect(x, y - u / 2, u, u);
      if (d === 'R') c.fillRect(x + s - u, y - u / 2, u, u);
      return s;
    }
    const fs = h * 0.45;
    const tw = this.measure(label, fs, 700);
    const w = Math.max(h * 1.3, tw + h * 0.6);
    rr(c, x, y - h / 2, w, h, h * 0.3);
    c.fillStyle = '#262b38';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.stroke();
    this.text(label, x + w / 2, y + h * 0.03, { size: fs, color: '#fff' });
    return w;
  }

  // A row of [glyphs..., text] centered at cx
  hintRow(items, cx, y, h, color = '#fff') {
    const gap = h * 0.35, fs = h * 0.55;
    const widthOf = it => (typeof it === 'string' && !it.startsWith('@'))
      ? this.measure(it, fs, 500)
      : it.startsWith('@D') ? h : PAD_COLORS[it.slice(1)] ? h : Math.max(h * 1.3, this.measure(it.slice(1), h * 0.45) + h * 0.6);
    const total = items.reduce((a, it) => a + widthOf(it), 0) + gap * (items.length - 1);
    let x = cx - total / 2;
    for (const it of items) {
      if (it.startsWith('@')) this.btn(it.slice(1), x, y, h);
      else this.text(it, x, y, { size: fs, align: 'left', color, weight: 500 });
      x += widthOf(it) + gap;
    }
  }

  drawMenu() {
    const c = this.ctx, W = this.W, H = this.H, t = this.time;
    const vg = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    // Title made of blocks
    const word = 'TETRIS', order = ['Z', 'L', 'O', 'S', 'I', 'T'];
    const bs = Math.floor(Math.min(W / 38, H / 15));
    const totalCols = word.split('').reduce((a, ch) => a + LETTERS[ch][0].length, 0) + word.length - 1;
    let x0 = (W - totalCols * bs) / 2;
    const y0 = H * 0.13;
    let gcol = 0;
    for (let i = 0; i < word.length; i++) {
      const L = LETTERS[word[i]], type = order[i];
      for (let k = 0; k < L[0].length; k++) {
        const bob = Math.sin(t * 0.003 - (gcol + k) * 0.35) * bs * 0.22;
        for (let r = 0; r < 5; r++) {
          if (L[r][k] !== '1') continue;
          const X = x0 + k * bs, Y = y0 + r * bs + bob;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.45;
          c.drawImage(this.glows[type], X - bs, Y - bs, bs * 3, bs * 3);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
          c.drawImage(this.sprites[type], X, Y, bs, bs);
        }
      }
      x0 += (L[0].length + 1) * bs;
      gcol += L[0].length + 1;
    }

    this.text('N E O N   E D I T I O N', W / 2, y0 + bs * 6.6, { size: bs * 0.62, color: this.accent, glow: true, weight: 700 });

    // Start prompt
    const blink = 0.55 + 0.45 * Math.sin(t * 0.005);
    const ph = Math.max(22, bs * 0.95);
    c.globalAlpha = blink;
    this.hintRow(['Drücke', '@A', 'oder', '@ENTER', 'zum Starten'], W / 2, H * 0.5, ph);
    c.globalAlpha = 1;

    // Controls legend
    const fs = clamp(H * 0.022, 12, 20);
    const bw = Math.min(W * 0.9, fs * 40), bh = fs * 13.5;
    const bx = (W - bw) / 2, by = H * 0.57;
    rr(c, bx, by, bw, bh, fs);
    c.fillStyle = 'rgba(8,10,26,0.75)';
    c.fill();
    c.strokeStyle = `hsla(${this.hue},100%,70%,0.4)`;
    c.lineWidth = 1.5;
    c.stroke();

    const colL = bx + fs * 1.5, colR = bx + bw / 2 + fs * 1.2;
    this.text('XBOX CONTROLLER', colL, by + fs * 1.5, { size: fs * 0.85, align: 'left', color: this.accent, spacing: 2 });
    this.text('TASTATUR', colR, by + fs * 1.5, { size: fs * 0.85, align: 'left', color: this.accent, spacing: 2 });
    const pad = [
      [['DL', 'DR'], 'Bewegen (auch Stick)'],
      [['DD'], 'Soft Drop'],
      [['DU', 'RT'], 'Hard Drop'],
      [['A', 'B'], 'Drehen rechts / links'],
      [['Y'], '180° drehen'],
      [['X', 'LB', 'RB'], 'Halten (Hold)'],
      [['START'], 'Pause'],
      [['VIEW'], 'Musik an / aus'],
    ];
    const keys = [
      ['← →', 'Bewegen'],
      ['↓', 'Soft Drop'],
      ['Leertaste', 'Hard Drop'],
      ['↑ / X', 'Drehen rechts'],
      ['Z / Y / Strg', 'Drehen links'],
      ['A', '180° drehen'],
      ['C / Shift', 'Halten (Hold)'],
      ['P / Esc  ·  M', 'Pause · Musik'],
    ];
    const rowH = fs * 1.35;
    let y = by + fs * 3.2;
    for (let i = 0; i < pad.length; i++) {
      let x = colL;
      for (const b of pad[i][0]) x += this.btn(b, x, y, fs * 1.05) + fs * 0.25;
      this.text(pad[i][1], colL + fs * 5.2, y, { size: fs * 0.72, align: 'left', color: '#dfe6ff', weight: 500 });
      this.text(keys[i][0], colR, y, { size: fs * 0.72, align: 'left', color: '#ffffff', weight: 700 });
      this.text(keys[i][1], colR + fs * 7.8, y, { size: fs * 0.72, align: 'left', color: '#dfe6ff', weight: 500 });
      y += rowH;
    }

    if (this.game.highscore > 0) {
      this.text(`REKORD  ${fmt(this.game.highscore)}`, W / 2, by + bh + fs * 1.6, { size: fs * 0.9, color: '#ffe03a', glow: true });
    }
  }

  dim(alpha) {
    const c = this.ctx;
    c.fillStyle = `rgba(2,3,12,${alpha})`;
    c.fillRect(0, 0, this.W, this.H);
  }

  drawPause() {
    const cell = this.cell, cx = this.W / 2, cy = this.H / 2;
    this.dim(0.62);
    this.text('PAUSE', cx, cy - cell * 2, { size: cell * 1.6, color: '#fff', glow: this.accent, weight: 900, spacing: 6 });
    const h = Math.max(22, cell * 0.7);
    this.hintRow(['@A', 'Weiter'], cx, cy, h);
    this.hintRow(['@Y', 'Neustart'], cx, cy + h * 1.6, h);
    this.hintRow(['@VIEW', 'Musik: ' + (Sound.musicOn ? 'an' : 'aus')], cx, cy + h * 3.2, h);
    this.text('Tastatur: P / Esc = Weiter · R = Neustart · M = Musik', cx, cy + h * 5, { size: h * 0.5, color: 'rgba(220,228,255,0.6)', weight: 500 });
  }

  drawGameOver() {
    const g = this.game, cell = this.cell, cx = this.W / 2, cy = this.H / 2;
    const k = clamp((this.gameOverT - 900) / 500, 0, 1);
    if (k <= 0) return;
    this.dim(0.7 * k);
    const c = this.ctx;
    c.save();
    c.globalAlpha = k;
    const s = 0.8 + 0.2 * easeOutBack(k);
    c.translate(cx, cy);
    c.scale(s, s);
    c.translate(-cx, -cy);
    this.text('GAME OVER', cx, cy - cell * 4, { size: cell * 1.5, color: '#ff3d5e', glow: true, weight: 900, spacing: 4 });
    this.text('SCORE', cx, cy - cell * 2.1, { size: cell * 0.4, color: 'rgba(210,220,255,0.7)', spacing: 3 });
    this.text(fmt(g.score), cx, cy - cell * 1.1, { size: cell * 1.1, color: '#fff', glow: this.accent, weight: 900 });
    if (g.newHighscore) {
      const p = 1 + 0.08 * Math.sin(this.time * 0.01);
      c.save();
      c.translate(cx, cy + cell * 0.2);
      c.scale(p, p);
      this.text('NEUER REKORD!', 0, 0, { size: cell * 0.6, color: '#ffe03a', glow: true, weight: 900 });
      c.restore();
    } else {
      this.text(`Rekord: ${fmt(g.highscore)}`, cx, cy + cell * 0.2, { size: cell * 0.45, color: '#ffe03a' });
    }
    const secs = Math.floor(g.stats.time / 1000);
    this.text(`Level ${g.level}  ·  ${g.lines} Lines  ·  ${g.stats.tetrises} Tetris  ·  ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      cx, cy + cell * 1.3, { size: cell * 0.38, color: 'rgba(220,228,255,0.8)', weight: 500 });
    const h = Math.max(22, cell * 0.7);
    c.globalAlpha = k * (0.6 + 0.4 * Math.sin(this.time * 0.005));
    this.hintRow(['@A', 'oder', '@ENTER', 'Nochmal spielen'], cx, cy + cell * 3, h);
    c.restore();
  }

  drawStatus() {
    const c = this.ctx, H = this.H;
    const fs = clamp(H * 0.017, 11, 16);
    const name = Input.padName;
    const x = fs, y = H - fs * 1.4;
    c.beginPath();
    c.arc(x + fs * 0.4, y, fs * 0.32, 0, Math.PI * 2);
    if (name) {
      c.fillStyle = '#3dff72';
      c.fill();
      this.text(`Controller verbunden: ${name}`, x + fs * 1.1, y, { size: fs * 0.8, align: 'left', color: 'rgba(220,255,230,0.85)', weight: 500 });
    } else {
      c.fillStyle = `rgba(255,200,40,${0.5 + 0.5 * Math.sin(this.time * 0.006)})`;
      c.fill();
      this.text('Kein Controller – Xbox-Controller anschließen und eine Taste drücken', x + fs * 1.1, y,
        { size: fs * 0.8, align: 'left', color: 'rgba(255,230,180,0.85)', weight: 500 });
    }
    if (!Sound.running) {
      this.text('🔈 Einmal ins Fenster klicken oder eine Taste drücken für Sound', this.W - fs, y,
        { size: fs * 0.8, align: 'right', color: 'rgba(220,228,255,0.6)', weight: 500 });
    }
  }

  drawToasts() {
    const c = this.ctx;
    const fs = clamp(this.H * 0.022, 13, 20);
    this.toasts.forEach((to, i) => {
      const inK = easeOutCubic(clamp(to.t / 300, 0, 1));
      const outK = clamp((to.dur - to.t) / 300, 0, 1);
      const a = Math.min(inK, outK);
      const w = this.measure(to.text, fs, 700) + fs * 2.4, h = fs * 2.2;
      const x = (this.W - w) / 2, y = fs * 1.2 + i * (h + fs * 0.5) - (1 - inK) * h;
      c.save();
      c.globalAlpha = a;
      rr(c, x, y, w, h, h / 2);
      c.fillStyle = 'rgba(10,14,32,0.88)';
      c.fill();
      c.strokeStyle = this.accent;
      c.lineWidth = 1.5;
      c.stroke();
      this.text(to.text, this.W / 2, y + h / 2, { size: fs, color: to.color });
      c.restore();
    });
  }
}
