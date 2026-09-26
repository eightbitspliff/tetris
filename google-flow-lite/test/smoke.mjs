// Offline-Test gegen eine nachgebaute Flow-Seite (test/mock.html) mit headless Chromium.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const dir = path.dirname(new URL(import.meta.url).pathname);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const html = fs.readFileSync(path.join(dir, 'mock.html'));
const web = http.createServer((q, r) => {
  if (q.url.includes('flow-content.google')) { const v = q.url.includes('.mp4'); r.writeHead(200, { 'content-type': v ? 'video/mp4' : 'image/png' }); return r.end(v ? Buffer.alloc(2048) : png); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(html);
}).listen(0);
const port = web.address().port;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-'));
const env = { ...process.env, FLOW_URL: `http://127.0.0.1:${port}`, FLOW_CDP_PORT: '9339', FLOW_HEADLESS: '1', FLOW_CHROME_ARGS: process.getuid?.() === 0 ? '--no-sandbox' : '', FLOW_OUT: out, FLOW_PROFILE: path.join(out, 'prof') };
const c = new Client({ name: 't', version: '1' });
await c.connect(new StdioClientTransport({ command: 'node', args: [path.join(dir, '..', 'server.js')], env }));
const tools = (await c.listTools()).tools;
console.log(`Tools: ${tools.length}, Schema-Größe: ${JSON.stringify(tools).length} Zeichen`);
let fail = 0;
const call = async (name, args = {}, expect, wantErr = false) => {
  const r = await c.callTool({ name, arguments: args });
  const t = r.content.map(x => x.text).join('');
  const ok = wantErr ? !!r.isError : !r.isError && (!expect || expect.test(t));
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name} ${JSON.stringify(args)}\n   ${t.replace(/\n/g, '\n   ')}`);
  return t;
};
await call('flow_status', {}, /home/);
await call('flow_project', {}, /abc123 Mein Film/);
await call('flow_project', { open: 'film' }, /project\/abc123/);
await call('flow_settings', { type: 'video', model: 'fast', ratio: '9:16', dur: 8, count: 2 }, /Video·9:16·720p·8 Sek\.·2-mal · Veo 3\.1 - Fast · 24cr/);
await call('flow_settings', { type: 'image', model: 'nano', ratio: '1:1', count: 1 }, /Bild·1:1.*Nano Banana Pro/);
await call('flow_generate', { prompt: 'Ein roter Fuchs im Schnee, 35mm', wait: 20 }, /fertig[\s\S]*\.png/);
await call('flow_generate', { prompt: 'Drohnenflug über Berge', type: 'video', model: 'quality', count: 2, wait: 20 }, /fertig[\s\S]*\.mp4[\s\S]*\.mp4/);
await call('flow_media', {}, /0 v/);
await call('flow_asset', { idx: 2, action: 'download' }, /\.png/);
await call('flow_asset', { idx: 0, action: 'trash' }, /ok trash/);
await call('flow_media', {}, /^0 v .*v2\.mp4[\s\S]*\(2\)/);
await call('flow_ui', { outline: true }, /textarea/);
await call('flow_ui', { shot: true }, /_shot\.jpg/);
await call('flow_settings', { model: 'gibtsnicht' }, null, true);
console.log(fs.readdirSync(out).filter(f => !f.startsWith('prof')).join(' '));
await c.close(); web.close();
try { const { chromium } = await import('playwright-core'); const b = await chromium.connectOverCDP('http://127.0.0.1:9339'); await (await b.newBrowserCDPSession()).send('Browser.close'); } catch {}
console.log(fail ? `FEHLGESCHLAGEN: ${fail}` : 'ALLE TESTS OK');
process.exit(fail ? 1 : 0);
