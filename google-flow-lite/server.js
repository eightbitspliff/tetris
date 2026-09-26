#!/usr/bin/env node
// google-flow-lite: wenige, grobe Tools mit knappen Antworten → minimaler Tokenverbrauch in Claude Cowork.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import * as F from './flow.js';

const srv = new McpServer({ name: 'google-flow-lite', version: '1.0.0' });
const txt = t => ({ content: [{ type: 'text', text: String(t) }] });
const LIMIT = 54000; // Cowork/remote-devices bricht nach 60 s ab

function tool(name, description, schema, fn) {
  srv.registerTool(name, { description, inputSchema: schema }, async args => {
    let timer;
    try {
      return await Promise.race([
        fn(args),
        new Promise(r => { timer = setTimeout(() => r(txt('läuft noch im Hintergrund – gleichen Aufruf/flow_job wiederholen')), LIMIT); }),
      ]);
    } catch (e) {
      return { ...txt(`FEHLER ${e.message.split('\n')[0]}`), isError: true };
    } finally { clearTimeout(timer); }
  });
}

const settingsSchema = {
  type: z.enum(['image', 'video', 'frames', 'ingredients']).optional(),
  model: z.string().optional().describe('omni|lite|fast|quality|nano'),
  ratio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']).optional(),
  res: z.enum(['360p', '720p']).optional(),
  dur: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).optional(),
  count: z.number().int().min(1).max(4).optional(),
};

tool('flow_status', 'Startet Debug-Chrome bei Bedarf, verbindet. → Ansicht·URL·Modell·Credits', {}, async () =>
  txt(F.fmtState(await F.status(true))));

tool('flow_project', 'Ohne Args: Projekte listen (idx id name). open=idx|id|Name|URL öffnet. create=true neues Projekt.',
  { open: z.string().optional(), create: z.boolean().optional() },
  async a => txt(await F.projects(a)));

tool('flow_settings', 'Einstellungen setzen+prüfen (nur Angegebenes). Ohne Args: aktuellen Stand lesen.', settingsSchema,
  async a => { const p = await F.getPage(); const r = await F.settings(p, a); return txt(r.summary + (r.miss.length ? ` · FEHLT: ${r.miss.join(', ')}` : '')); });

tool('flow_generate', 'Alles in einem: Einstellungen, optional Uploads, Prompt, Start, Warten, Auto-Download nach FLOW_OUT. Gibt Dateipfade oder Job-ID zurück.',
  {
    prompt: z.string(),
    ...settingsSchema,
    refs: z.array(z.string()).optional().describe('lokale Bilder als Bildelemente/Referenz'),
    start: z.string().optional().describe('Startframe-Datei'),
    end: z.string().optional().describe('Endframe-Datei'),
    edit: z.boolean().optional().describe('offenes Asset bearbeiten statt neu erstellen'),
    wait: z.number().optional().describe('Sek. blockieren, max 50, Std. 45'),
  },
  async a => {
    const { id, set } = await F.generate(a);
    const j = await F.waitJob(id, a.wait ?? 45);
    return txt(F.fmtJob(j) + (j.status === 'läuft' ? '\n→ flow_job' : ''));
  });

tool('flow_job', 'Wartet auf laufende Generierung (max 50 s) → Status + Dateipfade.', { id: z.string().optional(), wait: z.number().optional() },
  async a => { const j = await F.waitJob(a.id, a.wait ?? 50); return txt(j ? F.fmtJob(j) : 'kein Job'); });

tool('flow_media', 'Medien im Projekt: idx typ(i/v) url. Neueste zuerst oben.', { limit: z.number().optional(), full: z.boolean().optional().describe('volle URLs') },
  async a => {
    const p = await F.getPage();
    const m = (await F.mediaList(p)).filter(x => !x.th || a.full);
    const short = u => a.full ? u : u.split('?')[0].slice(-40);
    return txt(m.slice(0, a.limit ?? 12).map((x, i) => `${i} ${x.t} ${short(x.u)}${x.a ? ' ' + x.a : ''}`).join('\n') + `\n(${m.length})` || 'keine');
  });

tool('flow_asset', 'Aktion auf Medium idx (aus flow_media): download|animate|trash|favorite|reuse|add|cover|open',
  { idx: z.number().int(), action: z.enum(['download', 'animate', 'trash', 'favorite', 'reuse', 'add', 'cover', 'open']) },
  async ({ idx, action }) => {
    const p = await F.getPage();
    const m = (await F.mediaList(p)).filter(x => !x.th)[idx] || (await F.mediaList(p))[idx];
    if (!m) throw new Error(`kein Medium ${idx}`);
    if (action === 'download') { const d = await F.download(p, m.u, `asset-${idx}`); return txt(`${d.f} (${d.kb}KB)`); }
    const r = await F.ev(p, 'tileRect', m.u);
    if (!r) throw new Error('Kachel nicht sichtbar');
    if (action === 'open') { await p.mouse.click(r.x, r.y); await new Promise(s => setTimeout(s, 800)); return txt(F.fmtState(await F.ev(p, 'state'))); }
    await p.mouse.move(r.x, r.y); await F.ev(p, 'hover', m.u);
    await new Promise(s => setTimeout(s, 400));
    if (!(await F.ev(p, 'tileMenu', m.u))) throw new Error('Menü „Weitere Optionen" nicht gefunden');
    await new Promise(s => setTimeout(s, 400));
    await F.click(p, F.UI.menu[action], '[role=menuitem],button,[role=button],li');
    return txt(`ok ${action} ${idx}`);
  });

tool('flow_ui', 'Notfall-Werkzeug. click=Text/aria · sel=CSS klicken · key=Taste · type=Text tippen · outline=Bedienelemente · text=Seitentext · shot=Screenshot(Pfad) · goto=URL · upload=Dateien(+slot start|end)',
  {
    click: z.string().optional(), sel: z.string().optional(), key: z.string().optional(), type: z.string().optional(),
    outline: z.boolean().optional(), text: z.number().optional().describe('max Zeichen'), shot: z.boolean().optional(),
    goto: z.string().optional(), upload: z.array(z.string()).optional(), slot: z.enum(['start', 'end']).optional(),
  },
  async a => {
    const p = await F.getPage(); const out = [];
    if (a.goto) { await p.goto(a.goto, { waitUntil: 'domcontentloaded' }); out.push('ok'); }
    if (a.click) out.push(`klick: ${await F.click(p, a.click)}`);
    if (a.sel) { const r = await F.ev(p, 'clicksel', a.sel); if (!r) throw new Error(`kein ${a.sel}`); out.push(`klick: ${r}`); }
    if (a.type) { await p.keyboard.insertText(a.type); out.push('getippt'); }
    if (a.key) { await p.keyboard.press(a.key); out.push(`taste ${a.key}`); }
    if (a.upload) { await F.upload(p, a.upload, a.slot); out.push(`hochgeladen ${a.upload.length}`); }
    if (a.outline) out.push(await F.ev(p, 'outline', 80));
    if (a.text) out.push(await F.ev(p, 'text', a.text));
    if (a.shot) {
      fs.mkdirSync(F.CFG.out, { recursive: true });
      const f = path.join(F.CFG.out, `_shot.jpg`);
      await p.screenshot({ path: f, type: 'jpeg', quality: 45, scale: 'css' });
      out.push(f);
    }
    return txt(out.join('\n') || F.fmtState(await F.ev(p, 'state')));
  });

await srv.connect(new StdioServerTransport());
