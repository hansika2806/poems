# Roshni aur Lafz: build ledger

This project is being built as a sequence of complete emotional journeys. Each phase keeps the same paper, ink, weather, and literary-room language.

## Complete

### Phase 0: creative constitution

- Paper / ink / wood / weather visual language
- Serif interface type and handwritten poem type
- Original desk-at-dusk artwork
- Slow motion, restrained shadows, no generic AI dashboard styling
- Responsive desktop and narrow-screen rules

### Phase 1: first vertical slice

- Sky of Thoughts home
- Time-colored constellation stars
- Star-to-poem relationships
- Diary Desk-inspired slip layout
- Mine / Collected shelf structure
- Handmade poem booklets
- Scroll reader with Stage and Letter modes
- Roman Hinglish, Devanagari, and Urdu script switch
- Simulated line-by-line reading highlight
- Private toggle
- Time capsule preview
- New thought dialog
- Whisper-one-back ritual
- Mood filtering
- Rain room control using browser audio after user gesture

### Phase 2A: local writing foundation

- Clean `src/` and `assets/` folder structure
- Local persistence for user-created snippets
- Draft recovery while writing a thought
- Search across snippets and poem shelf metadata
- Persistent mood, shelf, script, reader mode, and private settings
- Stored margin notes per poem
- JSON archive export from the header
- Escaped user text before rendering into the page

### Phase 2B: poem writing studio

- New poem flow from the writing desk
- Edit poem flow from the reader
- Persistent user-created poems on the shelf
- Line-based poem editor with one line per reading beat
- Autosaved poem draft recovery
- Persistent title, mood, source, date, and poem lines
- Starter content separated into `src/content.js`

### Phase 2C: local vault and metadata

- Poem tags and snippet tags
- Tag chips on slips, booklets, and the reader
- Search across titles, moods, sources, and tags
- Local vault key setup using a browser-side hash
- Lock and unlock flow for the private room
- Lock state persists between reloads

### Phase 2D: local cloud room foundation

- Clean cloud boundary in `src/cloud.js` and `server.js`
- Account registration and sign-in with password validation
- Password hashing with Node `scrypt` and timing-safe verification
- Expiring bearer sessions with explicit sign-out
- AES-256-GCM encrypted workspace storage on the development server
- Revisioned workspace saves for multi-device synchronization
- Conflict responses when another device has changed the workspace
- Automatic local/remote merge and one retry after a conflict
- Cloud room status, sync-now, sign-out, and account deletion controls
- Local-first behavior remains intact when the cloud API is unavailable
- Disposable API verification for registration, save, conflict, and deletion

### Phase 3A: browser voice foundation

- Dedicated `src/voice.js` voice module
- Browser speech fallback for poem lines
- Line highlighting driven by speech callbacks
- Pause, resume, and stop controls
- Voice selection when the browser exposes voices
- Pace and pitch controls
- Language-aware voice preference for Roman, Devanagari, and Urdu modes
- Timed highlight fallback when speech synthesis is unavailable

### Phase 3A.5: integrated poem voice and atmosphere room

- Exact GoogleTranslate Hindi, Urdu, and English choices visible in the poem reader
- Google Translate audio adapter with long-line chunking and browser speech fallback
- Pace control for remote audio and full pitch control for browser voices
- Moodist sound collection copied into a clean app-owned asset boundary
- Eight poem atmosphere presets: rain, library, paper, train, morning, mushaira, monsoon, and cafe
- Layered looping ambience with fade-in, fade-out, pause, silence, and per-layer volume
- All 92 local sound assets available from the mixer for maximum creative choice
- Local sound mix persistence and preserved third-party license notes

### Phase 3B: cloud voice foundation

- Official Google Cloud TTS provider kept separate from GoogleTranslate Hindi
- Hindi Neural2 and Wavenet voice choices in the poem reader
- Server-side SSML generation so poem text and markup do not expose cloud credentials
- Per-line SSML marks and returned timepoints for real audio highlighting
- Cloud speaking-rate and pitch mapping
- 5,000-byte SSML request guard with a clear split-reading error
- Credential-gated fallback to existing Google Translate or browser voices
- Cloud TTS request endpoint protected by the cloud-room session

### Phase 3B.1: voice production polish

- Cloud credential readiness and documented quota visibility
- Automatic long-poem chunking with continuous same-voice playback
- In-memory and persistent IndexedDB audio caching
- SSML pauses, speed, pitch, and language presets per poem
- Caption panel and SRT transcript export from returned timepoints
- Private per-poem voice recording stored locally
- Cloud word timepoints with word-level poem highlighting
- Private explanation voice notes stored separately from poem readings

### Phase 4: poem layers and relationships

- Qafia and radif rhyme painter
- Urdu / Hindi word dictionary linked to its poem
- Seed constellation history from snippets into poems
- Jawab responses between poems
- Poet pages from collected shelf attribution
- Collected attribution and “why I saved this” metadata

### Phase 5: importing and assisted capture

- Photo import through an authenticated server-side Google Vision adapter
- Devanagari, Urdu, and Roman Hinglish language hints for OCR
- Voice-to-text drafts using the browser's Hindi, Urdu, or English recognition mode
- One-tap handoff from a spoken draft into either a poem or a new thought snippet
- Paste cleanup that removes list noise and normalizes punctuation spacing
- Automatic couplet spacing for loose pasted or recognized lines
- An editable preview before any imported text enters the poem editor
- Capture source metadata preserved in the poem draft

### Phase 6: expanded atmosphere and decoration

- Illustrated stanza moments with mood-aware ink, flower, leaf, and rain visuals
- Scrapbook asset library with pressed flowers, washi tape, stamps, washes, and marks
- Dedicated decorate mode inside the poem reader
- Drag, resize, rotate, remove, and layer decoration pieces
- Percentage-based decoration coordinates for responsive pages
- Persisted decoration layouts per poem with local/cloud workspace sync
- Restrained breathing motion while a stanza is being read

### Phase 7: rituals and sharing

- Fully locked time capsules
- Random open-app whisper playback
- Handwritten Poem of the Day
- Poem for Tonight by feeling
- Shareable couplet cards
- Year in Poems illustrated recap
- Per-item sharing permissions

### Phase 8: polish and release

- PWA manifest, install shell, service worker, and offline navigation fallback
- Keyboard skip link, visible focus states, and reduced-motion behavior
- Mobile-oriented responsive rules for rituals, decorations, controls, and dialogs
- Audio, OCR, voice, and cloud failure messages with local fallbacks where possible
- Asset, third-party license, privacy, and release checklist documentation
- Shell caching keeps personal workspace data and cloud responses out of the service-worker cache

### Phase 9: moonlit room redesign and core usability

- Reframed Sky, Write, Library, and Read as focused rooms inside one coherent writing space
- Replaced fixed decorative stars with a data-driven constellation scene and time-aware moonlit copy
- Added a dedicated Read destination so poems open into a poem-first listening room
- Added direct write-a-poem entry from the home scene and clearer writing/library navigation
- Reduced reader overload by moving voice and preservation tools behind progressive disclosure
- Added literary typography, responsive room layouts, clearer action hierarchy, and readable poem text
- Added keyboard-openable thought and poem entries for the constellation and writing lists
- Added room-to-room view transitions with reduced-motion support
- Made poem titles optional while drafting, with the first line used as a quiet working title
- Kept the poem save action visible while the editor scrolls and removed the brand microcopy from the top bar

### Phase 10: focused poetry experience

- Simplified the home into one moonlit scene with continuously drifting fireflies
- Replaced the old home shelf with a visible affirmation garden and manual affirmation writing
- Reduced the primary journey to two clear doors: Write and Library
- Replaced the poem modal with a full-page writing and editing desk
- Rebuilt the library as Mine, Collected, and Affirmations columns with explicit Read and Edit actions
- Removed visible rhyme painter, seed constellation, Jawab, margin notes, and preservation drawer controls
- Added a dedicated sticker column and soundscape choices to both poem editing and reading
- Kept Google Translate Hindi, Urdu, and other available voices directly accessible in the reading room
- Replaced browser-required-field popups with a calm inline “give the page one line” message
- Added boot-safe optional bindings and refreshed service-worker asset versions after the information-architecture change

### Phase 2D.1: production cloud hardening

Implemented in the local cloud boundary; provider-specific deployment remains in the handoff below.

- HTTPS-capable deployment and secure HttpOnly cookie session strategy
- Credentialed origin boundary instead of wildcard CORS
- Password recovery token flow with an optional verified-email webhook boundary
- Versioned encryption keys and an admin-only rotation route
- Account deletion retention policy and administrative restore workflow
- Explicit device list and session revocation in the account room
- Local filesystem storage kept behind a documented deployment adapter boundary

### Phase 11: focused reading controls and living pages

- Added one persistent sound dock with play/pause, stop, and choose-sound access from every room
- Replaced the oversized sound browser with featured rooms plus a compact full-library selector
- Added persistent delete actions to library poems, including starter poems removed by the user
- Added image import to the poem editing desk and preserved imported images with each poem
- Kept reading mode poem-first: saved stickers and imported images remain on the page, while editing tools stay in Edit
- Added choose poem and next poem controls to the reading room
- Added a reusable firefly field to both the home sky and reading page
- Expanded voice speed control from 1.3x to 2x

### Phase 12: reference-quality firefly atmosphere

- Replaced the per-view CSS dot animation with one reusable canvas-based firefly system
- Adapted the reference's radial glow, slow wandering motion, boundary steering, pulse, flicker, and cursor-field behavior
- Tuned the particle scale, speed, colors, opacity, and density for the poem app's dark indigo and paper rooms
- Mounted the animation once at the app shell so it continues across Sky, Write, Library, and Read without duplicate layers
- Added resize handling, hidden-tab pausing, device-pixel-ratio scaling, and reduced-motion support

### Phase 13: warmer lights and library typography

- Increased firefly density and tuned the palette toward deeper honey, amber, and ink-warm glow
- Enlarged Library titles, shelf headings, metadata, actions, and affirmation text for easier reading
- Darkened Library copy and action colors while preserving the calm Cormorant and Source Sans pairing
- Added mobile-specific type limits so the larger Library scale remains comfortable on small screens

### Phase 14: room-aware firefly contrast

- Kept the fuller, brighter firefly field for the dark Sky room
- Reduced particle count and halo size over cream Write, Library, and Read surfaces
- Switched paper rooms to a restrained multiply blend so amber cores remain visible without washing over the text
- Added room-aware canvas styling through the existing shell-view state

## Deployment handoff

- Connect the filesystem adapter to the chosen hosted database and object storage provider
- Supply production TLS, mail, admin-secret, and encryption-key environment values
- Complete a provider-specific backup/restore drill and per-file audio license audit
