# Neon Tetris

Grafisch aufwendiges Tetris im Browser (HTML5 Canvas, kein Build, keine Abhängigkeiten) –
voll spielbar mit dem **Xbox-Controller**.

## Windows-Programm (Installer)

Der Installer wird automatisch von GitHub Actions auf Windows gebaut und unter **Releases**
veröffentlicht (`NeonTetris-Setup-1.0.x.exe`). Herunterladen, ausführen, fertig – danach gibt es
eine Verknüpfung auf dem Desktop und im Startmenü. Deinstallation über
„Apps & Features“ in den Windows-Einstellungen.

- Startet im **Vollbild**; umschalten mit **F11** / **Alt+Enter** oder im Pausenmenü
- **Xbox-Controller** (USB/Bluetooth/Wireless-Adapter) inklusive Vibration; das Pausenmenü ist
  komplett per Controller bedienbar (▲▼ auswählen, Ⓐ bestätigen, Ⓑ zurück)
- Beenden: im Pausenmenü „Spiel beenden“ oder Ⓑ / Esc im Hauptmenü
- Installation ohne Administratorrechte (nur für den aktuellen Benutzer), ohne UAC-Abfrage
  und ohne `elevate.exe`-Hilfsprogramm – das vermeidet typische Fehlalarme von Virenscannern

### Warnungen von Windows SmartScreen, Browser und Virenscannern

Ohne **Code-Signatur** zeigen Windows SmartScreen und Browser bei neuen Programmen immer eine
Warnung („unbekannter Herausgeber“). Der Build ist dafür vorbereitet und signiert automatisch,
sobald Zugangsdaten als GitHub-Secrets hinterlegt sind (Repo → Settings → Secrets → Actions):

| Variante | Secrets |
|---|---|
| **Azure Trusted Signing** (Microsoft, günstig, sofortige SmartScreen-Reputation) | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGN_ENDPOINT`, `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`, `AZURE_SIGN_PUBLISHER` |
| **Code-Signing-Zertifikat** als `.pfx` (z. B. Certum, Sectigo) | `WIN_CSC_LINK` (Base64 der .pfx), `WIN_CSC_KEY_PASSWORD` |

In den Release-Notes steht bei jedem Build, ob der Installer signiert ist, und seine SHA-256-Prüfsumme.

Falls Bitdefender oder Microsoft Defender den Installer trotzdem melden (Fehlalarm), kann er dort
zur Prüfung eingereicht werden – danach wird er in der Regel freigegeben:
- Microsoft: https://www.microsoft.com/en-us/wdsi/filesubmission („Software developer“ → „Incorrectly detected as malware“)
- Bitdefender: auf bitdefender.de unter Support nach „Falsch-Positiv melden“ / „Submit a sample“ suchen
  und die Setup-Datei als Fehlalarm einreichen

Das Projekt liegt in `desktop/` (Electron). Lokal starten: `cd desktop && npm install && npm start`,
Installer bauen (unter Windows): `npm run dist`.

## Android-App

Die APK wird automatisch von GitHub Actions gebaut und unter **Releases** veröffentlicht
(`NeonTetris.apk`). Auf dem Handy herunterladen, öffnen und die Installation erlauben
(„Unbekannte Apps installieren“ für den Browser/Dateimanager zulassen).

- Xbox-Controller per Bluetooth koppeln – wird direkt von der App erkannt (inkl. Vibration,
  sofern Android/Controller das unterstützen)
- Ohne Controller: Touch-Steuerung (Ziehen = bewegen, Tippen = drehen, nach unten ziehen =
  Soft Drop, schnell nach unten wischen = Hard Drop, nach oben wischen = Halten)
- Hoch- und Querformat, Vollbild, Bildschirm bleibt an; Zurück-Taste = Pause/Menü

Das Android-Projekt liegt in `android/` (WebView-Hülle, die `index.html` + `js/` einbettet).
Lokal bauen: `cd android && ./gradlew assembleRelease` (Android SDK nötig).

## Auf den Desktop legen (Doppelklick zum Spielen)

`dist/NeonTetris.html` herunterladen und auf den Desktop legen – das ist eine einzelne,
eigenständige Datei. Doppelklick öffnet das Spiel im Browser.

## Starten

`index.html` im Browser öffnen (Chrome/Edge empfohlen, Firefox geht auch).
Controller per USB oder Bluetooth verbinden und **eine Taste drücken** – erst dann meldet
der Browser den Controller (Anzeige unten links). Für Sound einmal ins Fenster klicken.

## Steuerung

| Aktion | Xbox-Controller | Tastatur |
|---|---|---|
| Bewegen | D-Pad ◀ ▶ / linker Stick | ← → |
| Soft Drop | D-Pad ▼ / Stick runter | ↓ |
| Hard Drop | D-Pad ▲ / RT | Leertaste |
| Drehen rechts | A | ↑ / X |
| Drehen links | B | Z / Y / Strg |
| 180° drehen | Y | A |
| Halten (Hold) | X / LB / RB / LT | C / Shift |
| Pause | Start (Menü) | P / Esc |
| Musik an/aus | View | M |
| Neustart (in Pause) | Y | R |

## Features

- Moderne Regeln: 7-Bag, SRS-Rotation mit Wall-Kicks, Hold, Ghost-Piece, 5er-Vorschau,
  Lock-Delay, T-Spins, Combos, Back-to-Back, Perfect Clear, Level-Geschwindigkeit
- Grafik: glänzende Neon-Blöcke mit Glow, animierter Synthwave-Hintergrund mit Sternen,
  Farbwechsel pro Level, Partikelexplosionen, Lichtstrahlen, Schockwellen, Screen-Shake,
  Hard-Drop-Spuren, Gefahren-Warnung, Game-Over-Animation
- Controller-Vibration (Rumble) bei Hard Drop, Line Clears, Tetris, Level-Up
- Synthetisierte Soundeffekte und Chiptune-Musik (Korobeiniki), Tempo steigt mit dem Level
- Highscore wird lokal gespeichert
