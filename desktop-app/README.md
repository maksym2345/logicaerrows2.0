# Logic Arrows — desktop build

This folder contains the Electron wrapper that produces `Logic Arrows.exe` and the
Windows installer (`Logic.Arrows.Setup.<version>.exe`).

`index.html` is a copy of `../piston.html` (the current game version). After changing
`../piston.html`, copy it here and rebuild:

```powershell
Copy-Item ..\piston.html .\index.html -Force
npm install          # first time only
npm run dist         # -> dist\Logic.Arrows.Setup.<version>.exe
```

Notes:

- `appId` is `com.logicarrows.app` — do not change it, otherwise Windows treats the
  build as a different application and the old install is not upgraded/uninstalled.
- `artifactName` is `Logic.Arrows.Setup.${version}.${ext}` to match the download link
  used by `piston.html`.
- Publishing is configured for `github:testovij47-ctrl/LogicArrows`, so
  `electron-builder --publish always` uploads the installer and `latest.yml` to a
  GitHub release (requires `GH_TOKEN`).
- The game includes **ДІСПЛЕЙ МЕДІА 2.0** (`media_display_2`). Its settings accept
  any `http://` or `https://` URL plus size, zoom and a signal trigger. In the EXE it
  is rendered with Electron's `<webview>` (not a normal iframe), so sites that send
  `X-Frame-Options`/CSP and refuse to be embedded still load. The browser fallback
  uses an iframe and is limited by those same site headers.
- The website display uses the persistent, isolated `persist:logic-arrows-web`
  session. Camera/microphone/geolocation requests are denied; fullscreen and pointer
  lock are allowed. Links that try to open a popup are sent to the system browser.
- `main.js` does **not** load the game from `file://`. It starts a small HTTP server
  on `127.0.0.1:47821` and loads `http://127.0.0.1:47821/index.html`. YouTube embeds
  need an HTTP origin/referer; from `file://` every embed fails with error 153.
  The port is fixed so `localStorage` (worlds, settings) survives restarts — do not
  make it random. If the port is occupied the app tries the next 10 ports.
- The `autoplay-policy` switch is set so YouTube audio can start from a logic signal
  without a mouse click.

## Files

- `main.js` — Electron entry point (starts the local server, opens the game window).
- `index.html` — the game (copy of `piston.html`).
- `manifest.json`, `icon-192.png`, `icon-512.png` — PWA metadata served with the game.
- `build/icon.ico` — application/installer icon.
- `dist/` — build output (`Setup.exe`, `latest.yml`, `blockmap`).
