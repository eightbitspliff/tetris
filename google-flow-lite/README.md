# google-flow-lite

Token-sparsamer MCP-Server, mit dem Claude (Cowork / Desktop / Code) **Google Flow** (flow.google.com – Veo 3.1, Nano Banana Pro) bedient.

## Warum weniger Tokens?

| Bisher (google-flow-mcp + Skill) | google-flow-lite |
|---|---|
| Skill ~7,5 KB wird bei jeder Flow-Anfrage geladen | Skill ~1,8 KB |
| Debug-Chrome per Computer-Use starten (Screenshots ≈ 1–2 k Tokens je Bild) | Server startet Chrome selbst (`flow_status`/erster Aufruf) |
| Einstellungen: Panel öffnen + je Option ein `flow_eval` mit JS-Helfer + Prüfung | **ein** Aufruf `flow_settings`/`flow_generate`, intern geprüft über `aria-checked` |
| `flow_list_media` → `flow_generate` → mehrfach `flow_wait_media` → `flow_download` mit `src` | **ein** `flow_generate`: setzt, startet, wartet und lädt automatisch herunter |
| 60-s-Timeout bricht lange Aufrufe ab | Generierung läuft als Hintergrund-Job, jeder Aufruf endet < 55 s, `flow_job` holt das Ergebnis |
| lange URLs/JSON in Antworten | Antworten sind 1–5 Zeilen (Pfade, Status, Credits) |

Typischer Ablauf „Video erzeugen“: **2–3 Tool-Aufrufe** statt 10–20.

## Tools (8)

| Tool | Zweck |
|---|---|
| `flow_status` | Chrome starten/verbinden → `Ansicht · URL · Modell · Credits` |
| `flow_project` | Projekte listen / `open` (idx, id, Name, URL) / `create` |
| `flow_settings` | type, model, ratio, res, dur, count setzen + verifizieren |
| `flow_generate` | Einstellungen + Uploads (`refs`, `start`, `end`) + Prompt + Start + Warten + Download |
| `flow_job` | auf laufenden Job warten → Dateipfade |
| `flow_media` | Medienliste mit Index |
| `flow_asset` | download · animate · trash · favorite · reuse · add · cover · open |
| `flow_ui` | Notfall: click, sel, key, type, outline, text, shot, goto, upload |

## Installation (Windows)

Ordner `google-flow-lite` nach `C:\Users\flori\Documents\` kopieren, dann (Node ≥ 18 nötig):

```powershell
cd C:\Users\flori\Documents\google-flow-lite
npm install
```

Claude-Desktop/Cowork-Konfiguration (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-flow": {
      "command": "node",
      "args": ["C:\\Users\\flori\\Documents\\google-flow-lite\\server.js"],
      "env": { "FLOW_OUT": "C:\\Users\\flori\\Videos\\FlowMCP" }
    }
  }
}
```

Skill ersetzen: Inhalt von `skill/google-flow/SKILL.md` als Skill `google-flow` hinterlegen (Einstellungen → Skills), den alten langen Skill deaktivieren.

Erster Start: Chrome öffnet sich mit eigenem Profil – einmal bei Google anmelden. Existiert bereits `Documents\google-flow-mcp\chrome-profile` (altes Setup), wird dieses Profil samt Login automatisch weiterverwendet. Läuft schon ein Debug-Chrome auf Port 9222, verbindet sich der Server einfach damit.

## Umgebungsvariablen

| Variable | Standard |
|---|---|
| `FLOW_OUT` | `~/Videos/FlowMCP` |
| `FLOW_PROFILE` | `~/Documents/google-flow-mcp/chrome-profile` falls vorhanden, sonst `~/.google-flow-lite/chrome-profile` |
| `FLOW_CDP_PORT` | `9222` |
| `FLOW_CHROME` | automatisch gesucht |
| `FLOW_CHROME_ARGS` | zusätzliche Chrome-Argumente |
| `FLOW_UI` | JSON-Datei, die Werte aus `ui.json` überschreibt |
| `FLOW_HEADLESS` | `1` = unsichtbar (nicht für den ersten Login) |

## Wenn Google die Oberfläche ändert

Alle Beschriftungen (Radio-Labels, Menüeinträge, Modellnamen, Credit-Text, Medien-URL-Muster) stehen in `ui.json`. Anpassen genügt – kein Code. Für eine englische UI z. B. eine eigene Datei mit `FLOW_UI` einbinden.

## Test

```bash
npm test   # startet eine nachgebaute Flow-Seite + headless Chromium und prüft alle Tools
```

Der Test läuft offline gegen `test/mock.html`. Gegen die echte Flow-Seite ist er noch nicht geprüft; Stellen, die dort am ehesten abweichen können: Erkennung des Senden-Buttons, Frame-Slots (`start`/`end`) und das Muster der Medien-URLs. Alle drei lassen sich in `ui.json` anpassen.
