# Logic Arrows (local Python copy)

This folder is an offline copy of https://logic-arrows.io/ served by a small Python HTTP server.

## Run

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:8000/
```

The page uses guest mode by default, so maps and progress are stored locally in the browser (IndexedDB/localStorage).

## Notes

- All game assets were mirrored from the original site.
- Backend API calls were patched to use the same origin, so `app.py` can serve both the site and the small compatibility endpoints.
- Game version switching (1.2.1 / 1.3 / 1.4) is still available in Settings.
- A separate reference version with piston/physics mechanics is available at `http://127.0.0.1:8000/piston.html` (`piston.html`).

## Custom blocks

- **LED 8×8** (`led_matrix`) — pixel display with a built-in 8×8 editor, up to 32 frames, animation, level 0–255 and binary-code modes. Click the placed block to open the editor; frames are saved inside the world and synced in multiplayer.

PY