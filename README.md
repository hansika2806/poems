# Roshni aur Lafz

A private, atmospheric writing room for snippets, shayari, and poems.

## Structure

```text
poems/
  index.html          page shell and accessible landmarks
  PHASES.md           feature ledger and release sequence
  assets/             original visual assets
    sounds/
      moodist/        curated local copy of the Moodist sound collection
      ATTRIBUTIONS.md sound-source and license notes
  src/
    app.js            interaction, rendering, and page state
    content.js        starter poems and snippets
    storage.js        local persistence and JSON archive export
    voice.js          Google Translate and browser voice providers
    capture.js        paste cleanup, couplet shaping, speech capture, and OCR handoff
    cloud.js          account, sync, cloud voice, and authenticated OCR client boundary
    decorations.js    scrapbook catalog, stanza art, and responsive layout normalization
    rituals.js        capsules, daily poems, recaps, and share-card rendering
    pwa.js            service-worker registration for the offline app shell
    soundscape.js     layered local ambience, presets, fades, and volumes
    styles.css        visual system, responsive layout, and modes
```

## Run locally

From this folder:

```text
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

For the cloud-room development API, start a second terminal with:

```text
node server.js
```

It listens on `http://127.0.0.1:4174`. The API keeps its encrypted development data in `server-data/`, which is ignored by the project. Set `ROSHNI_ENCRYPTION_KEY` to a base64-encoded 32-byte key when running outside local development; do not expose this development server directly to the public internet.

To enable the Google Cloud voice choices, configure one server-side credential before starting the API:

```text
GOOGLE_CLOUD_TTS_API_KEY=your-key node server.js
```

or provide a short-lived OAuth access token with `GOOGLE_CLOUD_ACCESS_TOKEN`. Never place either credential in the browser code. The cloud voice endpoint builds SSML on the server, enforces the current 5,000-byte request limit, and returns line timepoints when Google Cloud accepts the request.

The current build is intentionally dependency-light. The poem reader exposes GoogleTranslate Hindi, GoogleTranslate Urdu, and GoogleTranslate English through the same voice selector. Those choices use a local server proxy that follows the supplied Read Aloud extension's Google Translate `batchexecute` flow, keeping token discovery and audio retrieval out of the browser. Browser speech remains the fallback if Google Translate is unavailable. Official Google Cloud TTS remains a separate provider for SSML and stable production timings.

To enable photo import, add a Google Vision API key to the same server process:

```text
GOOGLE_CLOUD_VISION_API_KEY=your-key node server.js
```

The capture table also works without cloud credentials: paste cleanup and couplet shaping stay local, and browser speech recognition creates an editable draft when the browser supports it. OCR is authenticated and server-side so the Vision key never enters the browser.

Phase 6 adds a dedicated decorate mode to the reader. Scrapbook pieces are stored with percentage-based positions, scale, rotation, and layer order inside each poem, so the page remains easy to revise on a phone or laptop.

Phase 7 adds sealed time capsules, a daily whisper selected once per day, Poem of the Day, Poem for Tonight, an illustrated Year in Poems recap, per-item private/shareable permissions, and downloadable couplet cards.

Phase 8 adds the installable offline shell and release safeguards. See [ASSET_AUDIT.md](ASSET_AUDIT.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before publishing; the Moodist audio collection still needs a final per-file license confirmation.

The footer soundscape opens a Moodist-inspired mixer with the local sound collection, eight poem atmosphere presets, layered playback, looping, fade transitions, per-sound volume, and saved mix settings. The full source repositories are kept only as references under `integrations/reference/`; the app runtime uses the small modules and assets described above.

The current private-room key is a browser-local vault lock, not a replacement for hosted authentication or production encrypted storage. Those hardening steps belong to Phase 2D.1.

Phase 2D now includes the local cloud-room foundation: registration, sign-in, scrypt password hashing, expiring sessions, AES-GCM encrypted workspace storage, revision conflicts, merge-and-retry sync, restore through the remote workspace response, and account deletion. Production hosting, email password recovery, HTTPS, key rotation, and a managed database remain in Phase 2D.1.

Phase 2D.1 now provides the production boundary around that foundation: HTTPS-capable serving, HttpOnly cookie sessions with credentialed CORS, short-lived recovery tokens through an optional recovery webhook, device/session inventory with revocation, versioned encryption keys with an admin-only rotation route, and account deletion retention with an admin restore route. Local development still uses the filesystem adapter. A hosted database/object-storage adapter remains a deployment choice rather than a fabricated local dependency.

Production hardening environment:

```text
NODE_ENV=production
TLS_KEY_FILE=/secure/tls/key.pem
TLS_CERT_FILE=/secure/tls/cert.pem
COOKIE_SESSIONS=true
ALLOWED_ORIGIN=https://your-app.example
ROSHNI_ADMIN_KEY=long-random-admin-secret
ROSHNI_ENCRYPTION_KEYS='{"v1":"base64-key"}'
ROSHNI_ACTIVE_KEY_VERSION=v1
RECOVERY_WEBHOOK_URL=https://your-mail-service.example/recovery
RECOVERY_WEBHOOK_KEY=webhook-secret
DELETION_RETENTION_DAYS=30
```

The development recovery endpoint only returns a token when `ALLOW_DEV_RECOVERY=true`; production never exposes that token. Rotate keys with an authenticated administrative `POST /api/admin/rotate-key`, revoke devices through the account room, and restore a recently deleted account with the administrative restore route.

Phase 3B and 3B.1 now include the cloud voice foundation plus automatic long-poem chunking, session and IndexedDB audio caching, caption display, SRT export, documented quota visibility, private local voice recording, Cloud word timepoints with word highlighting, private explanation voice notes, and a credential-gated fallback path.
