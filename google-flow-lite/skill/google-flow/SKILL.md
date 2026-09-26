---
name: google-flow
description: "Google Flow (flow.google.com, Veo/Nano Banana) über den MCP-Server google-flow-lite bedienen: Bilder, Videos, Frames, Bildelemente, Asset-Aktionen, Downloads. Nutzen bei jeder Flow-Anfrage."
---

# Google Flow (google-flow-lite)

Nur `flow_*`-Tools nutzen – kein Claude in Chrome, keine Computer-Use-Screenshots. Der Server startet Debug-Chrome selbst, wartet selbst und lädt selbst herunter.

**Standard (meist 2–3 Aufrufe):**
1. `flow_project {open:"<Name|idx>"}` (Liste: ohne Args; neu: `create:true`).
2. `flow_generate {prompt, type, model, ratio, res, dur, count, refs?, start?, end?}` → Dateipfade.
3. Nur falls `läuft`: `flow_job` wiederholen, bis `fertig`.

Werte: type `image|video|frames|ingredients` · model `nano` (Bild) / `lite|fast|quality|omni` (Video) · ratio `16:9|4:3|1:1|3:4|9:16` · res `360p|720p` · dur `4|6|8|10` · count `1–4`.
Frames = `start`/`end` Datei. Bildelemente = `refs` Dateien. `edit:true` bearbeitet das offene Asset statt neu zu erstellen.

**Sonst:** `flow_media` (idx-Liste) → `flow_asset {idx, action}` mit download|animate|trash|favorite|reuse|add|cover|open. `flow_settings` ohne Args = Ist-Stand + Credits.

**Nur bei Fehlern:** `flow_ui {text:800}` (Fehlermeldung/Quota) → `flow_ui {outline:true}` → `flow_ui {click:"Label"}`. Screenshot `flow_ui {shot:true}` nur als letztes Mittel.

Regeln: nie parallel generieren · Kosten (`cr`) vor großen Video-Serien nennen · Testausgaben in fremden Projekten per `trash` entfernen · Ergebnis melden: Pfad, Modell, Format, Credits.

Prompt: ein Satz je Ebene – Motiv+Aktion → Umgebung → Kamera → Licht → Stil → (Video) Audio/Dialog in „…“. Negatives als eigener Satz.
