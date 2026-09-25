// Copies the game (index.html + js/) from the repository root into desktop/game/.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'game');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'js'), path.join(out, 'js'), { recursive: true });
console.log('Copied game files to', out);
