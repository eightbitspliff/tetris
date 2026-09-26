import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { B } from './page.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadUi() {
  const base = JSON.parse(fs.readFileSync(path.join(HERE, 'ui.json'), 'utf8'));
  const extra = process.env.FLOW_UI && exists(process.env.FLOW_UI) ? JSON.parse(fs.readFileSync(process.env.FLOW_UI, 'utf8')) : {};
  return { ...base, ...extra };
}
export const UI = loadUi();

function findChrome() {
  const c = process.platform === 'win32'
    ? [path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
       path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
       path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
  return c.find(exists);
}

export const CFG = {
  port: +(process.env.FLOW_CDP_PORT || 9222),
  app: process.env.FLOW_URL || 'https://flow.google.com',
  out: process.env.FLOW_OUT || path.join(HOME, 'Videos', 'FlowMCP'),
  profile: process.env.FLOW_PROFILE
    || [path.join(HOME, 'Documents', 'google-flow-mcp', 'chrome-profile')].find(exists)
    || path.join(HOME, '.google-flow-lite', 'chrome-profile'),
  chrome: process.env.FLOW_CHROME || findChrome(),
  headless: process.env.FLOW_HEADLESS === '1',
};

let browser = null, page = null;

async function cdpUp() {
  try { const r = await fetch(`http://127.0.0.1:${CFG.port}/json/version`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function launchChrome() {
  if (!CFG.chrome) throw new Error('Chrome nicht gefunden – FLOW_CHROME setzen');
  fs.mkdirSync(CFG.profile, { recursive: true });
  const args = [`--remote-debugging-port=${CFG.port}`, `--user-data-dir=${CFG.profile}`, '--no-first-run', '--no-default-browser-check', CFG.app];
  if (CFG.headless) args.unshift('--headless=new');
  if (process.env.FLOW_CHROME_ARGS) args.unshift(...process.env.FLOW_CHROME_ARGS.split(' ').filter(Boolean));
  spawn(CFG.chrome, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  for (let i = 0; i < 40; i++) { if (await cdpUp()) return; await sleep(500); }
  throw new Error(`Chrome gestartet, aber CDP ${CFG.port} antwortet nicht`);
}

export async function getPage({ launch = true } = {}) {
  if (page && !page.isClosed() && browser?.isConnected()) return page;
  if (!(await cdpUp())) { if (!launch) throw new Error('Debug-Chrome läuft nicht'); await launchChrome(); }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CFG.port}`);
  browser.on('disconnected', () => { browser = null; page = null; });
  const ctx = browser.contexts()[0] || await browser.newContext();
  const host = new URL(CFG.app).host;
  page = ctx.pages().find(p => p.url().includes(host)) || ctx.pages().find(p => /^(about:blank|chrome:\/\/newtab)/.test(p.url())) || await ctx.newPage();
  if (!page.url().includes(host)) await page.goto(CFG.app, { waitUntil: 'domcontentloaded' });
  page.setDefaultTimeout(15000);
  return page;
}

export const ev = (p, op, a) => p.evaluate(B, [op, a ?? null, UI]);

async function until(fn, ms = 5000, step = 250) {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(step); }
  return v;
}

export async function click(p, t, sel) {
  const r = await until(() => ev(p, 'click', { t, sel }), 3000);
  if (!r) throw new Error(`nicht gefunden: ${[].concat(t).join(' | ')}`);
  await sleep(250);
  return r;
}

// ---------- Status / Projekte ----------
export async function status(launch) {
  const p = await getPage({ launch });
  const s = await ev(p, 'state');
  return s;
}
export const fmtState = s => [s.view, s.url.replace(/^https?:\/\//, ''), s.model, s.credits != null ? `${s.credits}cr` : '', s.err && `⚠ ${s.err}`].filter(Boolean).join(' · ');

export async function projects({ open, create } = {}) {
  const p = await getPage();
  if (create) {
    if (new URL(p.url()).pathname !== '/') await p.goto(CFG.app, { waitUntil: 'domcontentloaded' });
    await click(p, UI.newProject);
    await p.waitForURL(/\/project\//, { timeout: 20000 });
    return `neu: ${p.url()}`;
  }
  if (open == null) {
    if (new URL(p.url()).pathname.length > 1) await p.goto(CFG.app, { waitUntil: 'domcontentloaded' });
    const list = await until(async () => { const l = await ev(p, 'projects'); return l.length ? l : null; }, 8000);
    return (list || []).map((x, i) => `${i} ${x.id} ${x.n}`).join('\n') || 'keine Projekte';
  }
  let url;
  if (/^https?:/.test(open)) url = open;
  else {
    if (!(await ev(p, 'projects')).length) await p.goto(CFG.app, { waitUntil: 'domcontentloaded' });
    const list = (await until(async () => { const l = await ev(p, 'projects'); return l.length ? l : null; }, 8000)) || [];
    const o = String(open).toLowerCase();
    const hit = /^\d+$/.test(o) && +o < list.length ? list[+o] : list.find(x => x.id === open) || list.find(x => x.n.toLowerCase().includes(o));
    url = hit ? hit.h : new URL(`/project/${open}`, CFG.app).href;
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  const ok = await until(() => ev(p, 'prompt'), 10000);
  const s = await ev(p, 'state');
  return `offen: ${s.url} (${s.title})${ok ? '' : ' ⚠ kein Prompt-Feld'}`;
}

// ---------- Einstellungen ----------
const pick = (map, v, what) => {
  if (v == null) return null;
  const k = String(v).toLowerCase().replace(/s(ek)?$/, '').replace(/^x/, '').replace(/[-]?mal$/, '');
  const l = map[k] ?? map[String(v)];
  if (!l) throw new Error(`${what} ungültig: ${v} (${Object.keys(map).join('/')})`);
  return l;
};
const modelName = v => {
  if (!v) return null;
  const k = String(v).toLowerCase();
  return UI.models[k] || Object.values(UI.models).find(m => m.toLowerCase().includes(k)) || (() => { throw new Error(`Modell ungültig: ${v} (${Object.keys(UI.models).join('/')})`); })();
};

export async function settings(p, s = {}) {
  const want = [pick(UI.type, s.type, 'type'), pick(UI.ratio, s.ratio, 'ratio'), pick(UI.res, s.res, 'res'), pick(UI.dur, s.dur, 'dur'), pick(UI.count, s.count, 'count')].filter(Boolean);
  const model = modelName(s.model);
  let st = await ev(p, 'state');
  const opened = !st.panel;
  if (opened) { await click(p, UI.settingsOpen); await until(async () => (await ev(p, 'state')).panel, 4000); }
  const miss = [];
  const setRadio = async l => {
    for (let i = 0; i < 3; i++) {
      st = await ev(p, 'state');
      if (st.checked.some(c => c.toLowerCase() === l.toLowerCase())) return;
      await ev(p, 'click', { t: l, sel: '[role=radio],button,[role=button],[role=tab]' });
      await sleep(300);
    }
    st = await ev(p, 'state');
    if (!st.checked.some(c => c.toLowerCase() === l.toLowerCase())) miss.push(l);
  };
  if (want[0] && s.type) await setRadio(want.shift());
  if (model) {
    st = await ev(p, 'state');
    if (st.model !== model) {
      if (st.model) await ev(p, 'click', { t: st.model, sel: 'button,[role=button],[role=combobox],mat-select' });
      else await ev(p, 'click', { t: Object.values(UI.models) });
      await sleep(400);
      const ok = await until(() => ev(p, 'click', { t: model, sel: '[role=menuitem],[role=option],[role=menuitemradio],button,li' }), 3000);
      await sleep(400);
      if (!ok || (await ev(p, 'state')).model !== model) miss.push(model);
    }
  }
  for (const l of want) await setRadio(l);
  st = await ev(p, 'state');
  const summary = `${st.checked.map(c => c.replace(/^\S+_\S+ |^(image|videocam|crop_free|chrome_extension) /, '')).join('·')}${st.model ? ' · ' + st.model : ''}${st.credits != null ? ` · ${st.credits}cr` : ''}`;
  if (s.keepOpen !== true) { await p.keyboard.press('Escape'); await sleep(200); }
  return { summary, miss, credits: st.credits };
}

// ---------- Medien / Download ----------
export async function mediaList(p) { return ev(p, 'media'); }

const slug = s => (s || 'flow').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().split(/\s+/).slice(0, 6).join('-').toLowerCase().slice(0, 48) || 'flow';
const EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/quicktime': 'mov' };

export async function download(p, url, name) {
  fs.mkdirSync(CFG.out, { recursive: true });
  let buf, ct = '';
  if (!url.startsWith('blob:')) {
    try {
      const r = await p.context().request.get(url, { timeout: 45000 });
      if (r.ok()) { buf = await r.body(); ct = r.headers()['content-type'] || ''; }
    } catch { /* Fallback unten */ }
  }
  if (!buf) { const r = await ev(p, 'fetch', url); buf = Buffer.from(r.b64, 'base64'); ct = r.ct; }
  const ext = EXT[ct.split(';')[0].trim()] || (/video/.test(ct) ? 'mp4' : 'png');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let f = path.join(CFG.out, `${stamp}_${slug(name)}.${ext}`), i = 2;
  while (exists(f)) f = path.join(CFG.out, `${stamp}_${slug(name)}_${i++}.${ext}`);
  fs.writeFileSync(f, buf);
  return { f, kb: Math.round(buf.length / 1024) };
}

// ---------- Generieren (Hintergrund-Job, damit kein Tool-Aufruf ins 60-s-Limit läuft) ----------
const jobs = new Map(); let jobSeq = 0; let busy = null;

export async function upload(p, files, slot) {
  files = [].concat(files).map(f => path.resolve(f));
  for (const f of files) if (!exists(f)) throw new Error(`Datei fehlt: ${f}`);
  if (slot) {
    const lbl = UI.frameSlots[slot] || slot;
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 6000 }), click(p, lbl)]);
    await fc.setFiles(files);
  } else {
    await p.locator('input[type=file]').first().setInputFiles(files);
  }
  await sleep(1500);
}

async function fillPrompt(p, text) {
  const r = await until(() => ev(p, 'prompt'), 6000);
  if (!r) throw new Error('Prompt-Feld nicht gefunden');
  await p.mouse.click(r.x, r.y);
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await p.keyboard.press('Backspace');
  await p.keyboard.insertText(text);
  await sleep(300);
}

export async function generate(o) {
  if (busy && jobs.get(busy)?.status === 'läuft') throw new Error(`Job ${busy} läuft noch – erst flow_job abwarten (Flow arbeitet seriell)`);
  const p = await getPage();
  let st = await ev(p, 'state');
  if (st.view === 'home' || st.view === 'login') throw new Error(`kein Projekt offen (${st.view}) – erst flow_project`);
  if (st.view === 'detail' && !o.edit) { await click(p, UI.back); await sleep(800); }
  const set = await settings(p, o);
  if (set.miss.length) throw new Error(`Einstellung nicht gesetzt: ${set.miss.join(', ')} (Ist: ${set.summary})`);
  if (o.start) await upload(p, o.start, 'start');
  if (o.end) await upload(p, o.end, 'end');
  if (o.refs?.length) await upload(p, o.refs);
  const base = new Set((await mediaList(p)).map(m => m.k));
  await fillPrompt(p, o.prompt);
  let sub = await ev(p, 'submitBtn');
  if (!sub) { await p.keyboard.press('Enter'); sub = 'Enter'; }
  const id = `j${++jobSeq}`;
  const want = +(o.count || 1);
  const job = { id, status: 'läuft', files: [], note: '', set: set.summary, t0: Date.now() };
  jobs.set(id, job); busy = id;
  const limit = (o.timeout || (/video|frames|ingredients/.test(o.type || '') || /video/i.test(set.summary) ? 600 : 240)) * 1000;
  (async () => {
    try {
      let stable = 0, last = '';
      while (Date.now() - job.t0 < limit) {
        await sleep(3000);
        const now = (await mediaList(p)).filter(m => !base.has(m.k));
        const full = now.filter(m => !m.th || !now.some(n => !n.th && n.t === m.t));
        const sig = full.map(m => m.k).join('|');
        stable = sig && sig === last ? stable + 1 : 0; last = sig;
        if (full.length >= want && stable >= 1) {
          for (const [i, m] of full.entries())
            job.files.push({ ...(await download(p, m.u, `${o.prompt}${full.length > 1 ? '-' + (i + 1) : ''}`)), t: m.t, u: m.u });
          job.status = 'fertig'; return;
        }
        if (!full.length && Date.now() - job.t0 > 20000) {
          const s = await ev(p, 'state');
          if (s.err) { job.note = s.err; }
        }
      }
      job.status = 'timeout'; job.note ||= 'keine neuen Medien – flow_ui text prüfen';
    } catch (e) { job.status = 'fehler'; job.note = e.message.split('\n')[0]; }
  })();
  return { id, sub, set };
}

export async function waitJob(id, sec = 45) {
  const j = jobs.get(id || busy);
  if (!j) return null;
  const end = Date.now() + Math.min(sec, 52) * 1000;
  while (j.status === 'läuft' && Date.now() < end) await sleep(500);
  return j;
}
export const fmtJob = j => {
  const t = Math.round((Date.now() - j.t0) / 1000);
  const f = j.files.map(x => `${x.f} (${x.kb}KB)`).join('\n');
  return `${j.id} ${j.status} ${t}s · ${j.set}${j.note ? ` · ${j.note}` : ''}${f ? '\n' + f : ''}`;
};
