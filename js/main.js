'use strict';

const game = new Game();
const view = new Renderer(document.getElementById('game'), game);

// ---------- Game events -> graphics, sound, rumble ----------
game.on('move', () => Sound.sfx.move());
game.on('rotate', () => Sound.sfx.rotate());
game.on('hold', () => Sound.sfx.hold());
game.on('lock', e => {
  view.onLock(e);
  if (!e.hard) Sound.sfx.lock();
});
game.on('harddrop', e => {
  view.onHardDrop(e);
  Sound.sfx.hardDrop();
  Input.rumble(90, 0.35, 0.6);
});
game.on('clear', e => {
  view.onClear(e);
  Sound.sfx.clear(e.n, e.tspin);
  if (e.n === 4) Input.rumble(420, 1.0, 1.0);
  else Input.rumble(120 + e.n * 60, 0.25 + e.n * 0.15, 0.5);
});
game.on('text', e => view.onText(e));
game.on('levelup', level => {
  view.onLevelUp(level);
  Sound.sfx.levelUp();
  Sound.setLevel(level);
  Input.rumble(300, 0.6, 0.8);
});
game.on('gameover', () => {
  view.onGameOver();
  Sound.setMusicActive(false);
  Sound.sfx.gameOver();
  Input.rumble(700, 1.0, 0.6);
});

Input.on('connect', name => {
  view.toast(`🎮 ${name} verbunden`, '#3dff72');
  Sound.resume();
});
Input.on('disconnect', () => {
  view.toast('Controller getrennt', '#ff9820');
  if (game.state === 'playing') pause();
});

// ---------- State transitions ----------
function startGame() {
  Sound.resume();
  Sound.sfx.select();
  view.reset();
  game.start();
  Sound.setLevel(1);
  Sound.resetMusic();
  Sound.setMusicActive(true);
  Input.consume();
}
function pause() {
  game.state = 'paused';
  Sound.setMusicActive(false);
  Sound.sfx.pause();
}
function resume() {
  game.state = 'playing';
  Sound.setMusicActive(true);
  Sound.sfx.select();
  Input.consume();
}

function handleMeta() {
  if (Input.pressed('music')) {
    Sound.resume();
    view.toast(Sound.toggleMusic() ? '♪ Musik an' : 'Musik aus');
  }
  switch (game.state) {
    case 'menu':
      if (Input.pressed('confirm')) startGame();
      break;
    case 'playing':
      if (Input.pressed('pause')) pause();
      break;
    case 'paused':
      if (Input.pressed('restart')) startGame();
      else if (Input.pressed('pause') || Input.pressed('confirm')) resume();
      break;
    case 'gameover':
      if (view.gameOverT > 1100 && (Input.pressed('confirm') || Input.pressed('restart'))) startGame();
      break;
  }
}

// ---------- Touch controls ----------
const canvas = document.getElementById('game');
Touch.attach(canvas);
Touch.on('move', dir => { if (game.canAct()) game.move(dir); });
Touch.on('hard', () => { if (game.canAct()) game.hardDrop(); });
Touch.on('hold', () => { if (game.canAct()) game.holdPiece(); });
Touch.on('soft', on => Input.setTouchSoft(on && game.state === 'playing'));
Touch.on('tap', (x, y) => {
  Sound.resume();
  const cmd = view.hitButton(x, y);
  if (cmd) { runCommand(cmd); return; }
  switch (game.state) {
    case 'menu': startGame(); break;
    case 'playing': if (game.canAct()) game.rotate(x > view.W / 2 ? 1 : -1); break;
    case 'paused': resume(); break;
    case 'gameover': if (view.gameOverT > 1100) startGame(); break;
  }
});

canvas.addEventListener('click', e => {
  const cmd = view.hitButton(e.clientX, e.clientY);
  if (cmd) runCommand(cmd);
});

function runCommand(cmd) {
  if (cmd === 'pause' && game.state === 'playing') pause();
  else if (cmd === 'resume' && game.state === 'paused') resume();
  else if (cmd === 'restart') startGame();
  else if (cmd === 'music') view.toast(Sound.toggleMusic() ? '♪ Musik an' : 'Musik aus');
  else if (cmd === 'menu') toMenu();
}

function toMenu() {
  game.state = 'menu';
  Sound.setMusicActive(false);
  Input.consume();
}

// Hooks called by the Android app
window.androidBack = () => {
  if (game.state === 'playing') { pause(); return true; }
  if (game.state === 'paused' || game.state === 'gameover') { toMenu(); return true; }
  return false; // in the menu: let Android close the app
};
window.androidPause = () => { if (game.state === 'playing') pause(); };

// Browsers only allow audio after a user gesture.
for (const ev of ['keydown', 'pointerdown', 'touchstart']) {
  addEventListener(ev, () => Sound.resume(), { passive: true });
}
addEventListener('blur', () => { if (game.state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
canvas.focus();
// The Android app allows audio without a user gesture.
if (window.AndroidBridge) Sound.resume();

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(50, Math.max(0, now - last));
  last = now;
  Input.poll();
  Touch.stepPx = Math.max(18, view.cell * 0.9);
  handleMeta();
  game.update(dt, Input);
  view.update(dt);
  view.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
