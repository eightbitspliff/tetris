// Läuft IM Browser (wird von Playwright serialisiert). Muss komplett eigenständig sein – kein eval (Flow nutzt strikte CSP).
export function B([op, a, ui]) {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const low = s => norm(s).toLowerCase();
  const vis = e => !!(e && (e.offsetParent || e.getClientRects().length)) && getComputedStyle(e).visibility !== 'hidden';
  const lab = e => norm(e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || '');
  const aria = e => low(e.getAttribute('aria-label') || e.getAttribute('title') || '');
  const CL = '[role=radio],[role=menuitem],[role=menuitemradio],[role=option],[role=tab],[role=switch],button,[role=button],a,mat-list-item,[role=link],[role=combobox]';
  const fire = el => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const t of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o));
  };
  const find = (texts, sel = CL, root = document) => {
    const els = [...root.querySelectorAll(sel)].filter(vis);
    for (const t of [].concat(texts)) {
      const T = low(t);
      const hit = els.find(e => low(lab(e)) === T) || els.find(e => aria(e) === T)
        || els.find(e => low(lab(e)).endsWith(' ' + T)) || els.find(e => low(lab(e)).startsWith(T + ' '));
      if (hit) return hit;
    }
    for (const t of [].concat(texts)) {
      const T = low(t);
      const hit = els.find(e => low(lab(e)).includes(T) || aria(e).includes(T));
      if (hit) return hit;
    }
    return null;
  };
  const clickEl = el => { fire(el); return lab(el).slice(0, 60) || true; };
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; };
  const promptBox = () => [...document.querySelectorAll('textarea,[contenteditable=true],[role=textbox]')].filter(vis)
    .sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width)[0];
  const mediaRe = new RegExp(ui.mediaUrl), thumbRe = new RegExp(ui.thumbUrl);
  const media = () => {
    const out = new Map();
    for (const e of document.querySelectorAll('img,video')) {
      const srcs = e.tagName === 'VIDEO' ? [e.currentSrc || e.src, ...[...e.querySelectorAll('source')].map(s => s.src)] : [e.currentSrc || e.src];
      const r = e.getBoundingClientRect();
      if (r.width < 48 || r.height < 48) continue;
      for (const s of srcs) {
        if (!s || s.startsWith('data:') || !mediaRe.test(s)) continue;
        const k = s.startsWith('blob:') ? s : s.split('?')[0];
        if (out.has(k)) continue;
        out.set(k, { k, u: s, t: e.tagName === 'VIDEO' ? 'v' : 'i', th: thumbRe.test(s), y: Math.round(r.y + scrollY), x: Math.round(r.x), a: norm(e.alt || e.getAttribute('aria-label') || '').slice(0, 50) });
      }
    }
    return [...out.values()].sort((p, q) => p.y - q.y || p.x - q.x);
  };
  const tileOf = src => {
    const k = src.split('?')[0];
    const m = [...document.querySelectorAll('img,video,source')].find(e => (e.currentSrc || e.src || '').split('?')[0] === k);
    return m && (m.tagName === 'SOURCE' ? m.parentElement : m);
  };

  switch (op) {
    case 'click': { const el = find(a.t, a.sel || CL); if (!el) return null; return clickEl(el); }
    case 'rect': { const el = a.css ? [...document.querySelectorAll(a.css)].find(vis) : find(a.t, a.sel || CL); return el ? rect(el) : null; }
    case 'clicksel': { const el = [...document.querySelectorAll(a)].find(vis); if (!el) return null; fire(el); return lab(el).slice(0, 60) || true; }
    case 'has': return !!find(a.t, a.sel || CL);
    case 'state': {
      const txt = document.body.innerText;
      const cm = txt.match(new RegExp(ui.credits));
      const pb = promptBox();
      const ph = pb ? norm(pb.getAttribute('placeholder') || pb.getAttribute('aria-label') || pb.dataset.placeholder || '') : '';
      const models = Object.values(ui.models);
      const modelEl = [...document.querySelectorAll('button,[role=button],[role=combobox],mat-select')].filter(vis).find(e => models.some(m => lab(e).includes(m)));
      return {
        url: location.href, title: document.title,
        checked: [...document.querySelectorAll('[role=radio][aria-checked=true],[role=radio].mat-mdc-radio-checked,[aria-selected=true][role=radio]')].filter(vis).map(lab),
        panel: !!find(Object.values(ui.type), '[role=radio]'),
        model: modelEl ? models.find(m => lab(modelEl).includes(m)) : null,
        credits: cm ? +cm[1] : null,
        ph, view: /\/project\//.test(location.pathname) ? (ph && low(ph).includes(low(ui.promptEdit)) ? 'detail' : 'project') : (/accounts\.google/.test(location.host) ? 'login' : 'home'),
        err: (txt.match(new RegExp('[^\\n]{0,80}(' + ui.errorText + ')[^\\n]{0,80}', 'i')) || [''])[0].trim()
      };
    }
    case 'projects': {
      const m = new Map();
      for (const e of document.querySelectorAll('a[href*="/project/"]')) {
        const id = (e.getAttribute('href').match(/\/project\/([^/?#]+)/) || [])[1];
        if (id && !m.has(id)) m.set(id, { id, n: norm(e.innerText || e.getAttribute('aria-label')).slice(0, 40), h: new URL(e.getAttribute('href'), location.href).href });
      }
      return [...m.values()];
    }
    case 'media': return media();
    case 'prompt': { const pb = promptBox(); return pb ? rect(pb) : null; }
    case 'submitBtn': {
      const pb = promptBox();
      const cands = [...document.querySelectorAll('button,[role=button]')].filter(vis).filter(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
      for (const t of ui.submit) {
        const T = low(t);
        const b = cands.find(e => low(lab(e)) === T || aria(e) === T);
        if (b) { fire(b); return lab(b) || aria(b); }
      }
      if (pb) { // nächster Button rechts vom Prompt-Feld
        const pr = pb.getBoundingClientRect();
        const b = cands.filter(e => { const r = e.getBoundingClientRect(); return r.x >= pr.right - 120 && Math.abs(r.y + r.height / 2 - (pr.y + pr.height / 2)) < 120; })
          .sort((p, q) => q.getBoundingClientRect().x - p.getBoundingClientRect().x)[0];
        if (b && /arrow|send|senden|erstellen|create/i.test(lab(b) + aria(b))) { fire(b); return lab(b) || aria(b); }
      }
      return null;
    }
    case 'tileRect': { const el = tileOf(a); return el ? rect(el) : null; }
    case 'tileMenu': { // „Weitere Optionen“ nahe der Kachel
      const el = tileOf(a); if (!el) return null;
      let n = el;
      for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
        const b = [...n.querySelectorAll('button,[role=button]')].find(x => aria(x) === low(ui.moreOptions) || low(lab(x)).includes('more_vert'));
        if (b) { fire(b); return true; }
      }
      const r = el.getBoundingClientRect();
      const b = [...document.querySelectorAll('button,[role=button]')].filter(vis).filter(x => aria(x) === low(ui.moreOptions))
        .map(x => [x, x.getBoundingClientRect()]).filter(([, q]) => q.x >= r.x - 5 && q.x <= r.right + 5 && q.y >= r.y - 5 && q.y <= r.bottom + 5)[0];
      if (b) { fire(b[0]); return true; }
      return false;
    }
    case 'hover': { const el = tileOf(a); if (!el) return false; let n = el; for (let i = 0; i < 4 && n; i++, n = n.parentElement) fire_hover(n); return true; }
    case 'outline': {
      const els = [...document.querySelectorAll(CL + ',textarea,input:not([type=hidden]),[contenteditable=true]')].filter(vis);
      const seen = new Set(), out = [];
      for (const e of els) {
        const role = e.getAttribute('role') || e.tagName.toLowerCase();
        let l = lab(e).slice(0, 50) || norm(e.getAttribute('placeholder')).slice(0, 50);
        if (!l) continue;
        const st = e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true' ? '*' : '';
        const line = `${role}:${l}${st}`;
        if (!seen.has(line)) { seen.add(line); out.push(line); }
        if (out.length >= (a || 80)) break;
      }
      return out.join('\n');
    }
    case 'text': return document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, a || 1500);
    case 'fetch': return (async () => { // Fallback-Download im Seitenkontext (blob:, Cookies)
      const r = await fetch(a, { credentials: 'include' }); const b = await r.blob();
      const buf = new Uint8Array(await b.arrayBuffer()); let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { ct: b.type, b64: btoa(s) };
    })();
    case 'eval': return null;
  }
  function fire_hover(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, composed: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove']) el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o));
  }
  return null;
}
