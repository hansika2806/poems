# Asset and privacy audit

## Runtime assets

- `assets/desk-at-dusk.png`: app artwork already present in the project; confirm its provenance before public distribution.
- `assets/scrapbook/*.svg`: created for this app, with no external image dependency.
- `assets/roshni-icon.svg`: created for this app.
- `assets/sounds/moodist/`: copied from the local Moodist project. The repository's MIT notice is preserved, but individual audio files may carry separate Pixabay or CC0 attribution. Keep the source and license notes with any release and complete the per-file audit before publishing.
- Google Fonts: loaded from Google Fonts at runtime. A fully self-contained release should download and license the selected font files or document the hosted-font dependency.

## Reference-only code

The Read Aloud and Moodist source repositories under `integrations/reference/` are not imported by the runtime bundle. They remain inspection material only.

## Privacy checks

- Personal writing is stored locally by default.
- Cloud workspace data is encrypted by the development API before it is written to `server-data/`.
- TTS and OCR credentials remain server-side.
- Voice recordings stay in browser IndexedDB.
- The service worker caches the app shell and scrapbook assets, not cloud responses, account data, or the full sound library.
- `server-data/` is ignored and must never be committed.
