'use strict';

// Core Tetris rules: 7-bag, SRS rotation with wall kicks, hold, lock delay,
// T-spins, combos, back-to-back and guideline scoring.
const COLS = 10, ROWS = 20, HIDDEN = 2, TOTAL = ROWS + HIDDEN;
const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};

const COLORS = {
  I: '#22e6ff', J: '#3d6bff', L: '#ff9820', O: '#ffe03a',
  S: '#3dff72', T: '#c34dff', Z: '#ff3d5e',
};

const rotCW = m => m.map((row, r) => row.map((_, c) => m[m.length - 1 - c][r]));

const MATRICES = {};
for (const t of TYPES) {
  const r = [SHAPES[t]];
  for (let i = 1; i < 4; i++) r.push(rotCW(r[i - 1]));
  MATRICES[t] = r;
}

// SRS kick tables, [dx, dy] with dy positive = up.
const KICKS = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICKS_180 = [[0, 0], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, -1]];

const LOCK_DELAY = 500;   // ms a grounded piece may rest before locking
const MAX_RESETS = 15;    // move/rotate lock-delay resets per piece
const CLEAR_TIME = 420;   // ms line clear animation
const DAS = 160;          // ms before auto-repeat kicks in
const ARR = 33;           // ms between auto-repeat moves
const SOFT_FACTOR = 6;    // soft drop falls this many times faster than gravity
const SOFT_MIN_MS = 45;   // but never faster than this per row

function gravityMs(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

function loadHighscore() {
  try { return parseInt(localStorage.getItem('neon-tetris-highscore'), 10) || 0; }
  catch (e) { return 0; }
}
function saveHighscore(v) {
  try { localStorage.setItem('neon-tetris-highscore', String(v)); } catch (e) { /* ignore */ }
}

class Game {
  constructor() {
    this.listeners = {};
    this.state = 'menu';
    this.highscore = loadHighscore();
    this.board = this.emptyBoard();
    this.queue = [];
    this.hold = null;
    this.canHold = true;
    this.piece = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.clearing = null;
    this.stats = { pieces: 0, tetrises: 0, tspins: 0, time: 0, maxCombo: 0 };
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach(f => f(data)); }

  emptyBoard() { return Array.from({ length: TOTAL }, () => Array(COLS).fill(null)); }

  nextFromBag() {
    if (!this.bag.length) {
      this.bag = TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  start() {
    this.board = this.emptyBoard();
    this.bag = [];
    this.queue = [];
    while (this.queue.length < 6) this.queue.push(this.nextFromBag());
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.b2b = false;
    this.clearing = null;
    this.dasDir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.lastHoriz = 0;
    this.newHighscore = false;
    this.stats = { pieces: 0, tetrises: 0, tspins: 0, time: 0, maxCombo: 0 };
    this.state = 'playing';
    this.emit('start');
    this.spawn();
  }

  spawn(type) {
    const t = type || this.queue.shift();
    while (this.queue.length < 6) this.queue.push(this.nextFromBag());
    const p = { type: t, rot: 0, x: t === 'O' ? 4 : 3, y: HIDDEN - 1 };
    const m = MATRICES[t][0];
    if (this.collides(m, p.x, p.y)) {
      p.y--;
      if (this.collides(m, p.x, p.y)) { this.piece = p; this.gameOver(); return; }
    }
    this.piece = p;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = p.y;
    this.lastAction = null;
    this.lastKick = 0;
  }

  get matrix() { return MATRICES[this.piece.type][this.piece.rot]; }

  collides(m, x, y) {
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const bx = x + c, by = y + r;
        if (bx < 0 || bx >= COLS || by >= TOTAL) return true;
        if (by >= 0 && this.board[by][bx]) return true;
      }
    }
    return false;
  }

  grounded() {
    return !!this.piece && this.collides(this.matrix, this.piece.x, this.piece.y + 1);
  }

  cellsOf(p, y = p.y) {
    const out = [];
    const m = MATRICES[p.type][p.rot];
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++)
        if (m[r][c]) out.push({ x: p.x + c, y: y + r });
    return out;
  }

  ghostY() {
    let y = this.piece.y;
    while (!this.collides(this.matrix, this.piece.x, y + 1)) y++;
    return y;
  }

  get lockProgress() {
    return this.piece && this.grounded() ? Math.min(1, this.lockTimer / LOCK_DELAY) : 0;
  }

  afterMove() {
    if (this.lockTimer > 0 && this.lockResets < MAX_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  reachedRow() {
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
  }

  move(dx) {
    const p = this.piece;
    if (this.collides(this.matrix, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastAction = 'move';
    this.afterMove();
    this.emit('move');
    return true;
  }

  rotate(dir) {
    const p = this.piece;
    if (p.type === 'O') return false;
    const from = p.rot, to = (p.rot + dir + 4) % 4;
    const m = MATRICES[p.type][to];
    const tests = dir === 2 ? KICKS_180 : (p.type === 'I' ? KICKS_I : KICKS)['' + from + to];
    for (let i = 0; i < tests.length; i++) {
      const [kx, ky] = tests[i];
      if (!this.collides(m, p.x + kx, p.y - ky)) {
        p.x += kx;
        p.y -= ky;
        p.rot = to;
        this.lastAction = 'rotate';
        this.lastKick = i;
        this.reachedRow();
        this.afterMove();
        this.emit('rotate');
        return true;
      }
    }
    return false;
  }

  hardDrop() {
    const p = this.piece;
    const from = this.cellsOf(p);
    const gy = this.ghostY();
    const dist = gy - p.y;
    p.y = gy;
    if (dist > 0) this.lastAction = 'drop';
    this.score += dist * 2;
    this.emit('harddrop', { type: p.type, from, to: this.cellsOf(p), dist });
    this.lock(true);
  }

  holdPiece() {
    if (!this.canHold) return;
    const cur = this.piece.type;
    this.canHold = false;
    this.emit('hold');
    if (this.hold) {
      const h = this.hold;
      this.hold = cur;
      this.spawn(h);
    } else {
      this.hold = cur;
      this.spawn();
    }
  }

  tspinType() {
    const p = this.piece;
    if (p.type !== 'T' || this.lastAction !== 'rotate') return null;
    const occ = (x, y) => x < 0 || x >= COLS || y >= TOTAL || (y >= 0 && !!this.board[y][x]);
    const c = [occ(p.x, p.y), occ(p.x + 2, p.y), occ(p.x + 2, p.y + 2), occ(p.x, p.y + 2)]; // TL TR BR BL
    if (c.filter(Boolean).length < 3) return null;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
    return (c[front[0]] && c[front[1]]) || this.lastKick === 4 ? 'full' : 'mini';
  }

  lock(hard = false) {
    const p = this.piece;
    const tspin = this.tspinType();
    const cells = this.cellsOf(p);
    let allHidden = true;
    for (const { x, y } of cells) {
      if (y >= 0) this.board[y][x] = p.type;
      if (y >= HIDDEN) allHidden = false;
    }
    this.piece = null;
    this.stats.pieces++;
    this.emit('lock', { type: p.type, cells, hard });
    if (allHidden) { this.gameOver(); return; }

    const full = [];
    for (let r = 0; r < TOTAL; r++) if (this.board[r].every(Boolean)) full.push(r);
    const n = full.length;

    let pts, label = null;
    if (tspin === 'full') {
      pts = [400, 800, 1200, 1600][n] || 1600;
      label = 'T-SPIN' + ['', ' SINGLE', ' DOUBLE', ' TRIPLE'][n];
    } else if (tspin === 'mini') {
      pts = [100, 200, 400][n] || 400;
      label = 'T-SPIN MINI';
    } else {
      pts = [0, 100, 300, 500, 800][n];
      if (n === 4) label = 'TETRIS';
    }

    let b2b = false;
    if (n > 0) {
      const difficult = n === 4 || !!tspin;
      if (difficult && this.b2b) { pts *= 1.5; b2b = true; }
      this.b2b = difficult;
      this.combo++;
    } else {
      this.combo = -1;
    }
    pts = Math.floor(pts * this.level);
    if (this.combo > 0) pts += 50 * this.combo * this.level;
    this.score += pts;
    if (tspin) this.stats.tspins++;
    if (n === 4) this.stats.tetrises++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    if (label || this.combo > 0) {
      this.emit('text', { label, b2b, combo: this.combo, pts, n, tspin });
    }

    if (n) {
      this.clearing = { rows: full, t: 0, dur: CLEAR_TIME };
      const cells = [];
      for (const r of full) this.board[r].forEach((t, x) => cells.push({ x, y: r, type: t }));
      this.emit('clear', { rows: full, n, tspin, cells });
    } else {
      this.canHold = true;
      this.spawn();
    }
  }

  finishClear() {
    const rows = this.clearing.rows;
    this.board = this.board.filter((_, i) => !rows.includes(i));
    while (this.board.length < TOTAL) this.board.unshift(Array(COLS).fill(null));
    this.clearing = null;

    const before = this.level;
    this.lines += rows.length;
    this.level = Math.floor(this.lines / 10) + 1;
    if (this.level > before) this.emit('levelup', this.level);

    if (this.board.every(r => r.every(c => !c))) {
      const bonus = 3000 * this.level;
      this.score += bonus;
      this.emit('text', { label: 'PERFECT CLEAR', pts: bonus, perfect: true, combo: -1 });
    }
    this.canHold = true;
    this.spawn();
  }

  gameOver() {
    this.state = 'gameover';
    if (this.score > this.highscore) {
      this.highscore = this.score;
      this.newHighscore = true;
      saveHighscore(this.score);
    }
    this.emit('gameover', { newHighscore: this.newHighscore });
  }

  update(dt, inp) {
    if (this.state !== 'playing') return;
    this.stats.time += dt;

    // Track horizontal direction even during the clear animation (DAS carry).
    const l = inp.down('left'), r = inp.down('right');
    if (inp.pressed('left')) this.lastHoriz = -1;
    if (inp.pressed('right')) this.lastHoriz = 1;
    const dir = l && r ? this.lastHoriz : l ? -1 : r ? 1 : 0;

    if (this.clearing) {
      this.clearing.t += dt;
      if (dir !== this.dasDir) { this.dasDir = dir; this.dasTimer = 0; }
      else if (dir) this.dasTimer += dt;
      if (this.clearing.t >= this.clearing.dur) this.finishClear();
      return;
    }
    if (!this.piece) return;

    if (inp.pressed('hold')) {
      this.holdPiece();
      if (this.state !== 'playing') return;
    }
    if (inp.pressed('rotCW')) this.rotate(1);
    if (inp.pressed('rotCCW')) this.rotate(-1);
    if (inp.pressed('rot180')) this.rotate(2);
    if (inp.pressed('hard')) { this.hardDrop(); return; }

    // Horizontal movement with DAS / ARR
    if (dir !== this.dasDir) {
      this.dasDir = dir;
      this.dasTimer = 0;
      this.arrTimer = 0;
      if (dir) this.move(dir);
    } else if (dir) {
      this.dasTimer += dt;
      if (this.dasTimer >= DAS) {
        this.arrTimer += dt;
        while (this.arrTimer >= ARR) {
          this.arrTimer -= ARR;
          if (!this.move(dir)) { this.arrTimer = 0; break; }
        }
      }
    }

    // Gravity / soft drop
    const soft = inp.down('soft');
    let interval = gravityMs(this.level);
    if (soft) interval = Math.min(interval, Math.max(interval / SOFT_FACTOR, SOFT_MIN_MS));
    // Never carry more than one row of accumulated time (prevents a jump when pressing down).
    this.gravityAcc = Math.min(this.gravityAcc, interval) + dt;
    let guard = 0;
    while (this.gravityAcc >= interval && guard++ < TOTAL) {
      this.gravityAcc -= interval;
      const p = this.piece;
      if (!this.collides(this.matrix, p.x, p.y + 1)) {
        p.y++;
        this.lastAction = 'drop';
        if (soft) this.score += 1;
        this.reachedRow();
      } else {
        this.gravityAcc = 0;
        break;
      }
    }
    if (guard >= TOTAL) this.gravityAcc = 0;

    if (this.grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    }
  }
}
