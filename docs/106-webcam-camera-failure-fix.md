# 106 — Webcam camera-failure fix (no more app freeze)

## Problem

Opening the camera from the New Lead form (`PersonAvatar` → `Capture` →
`Capture photo` → `WebcamCaptureDialog`) froze the entire app whenever
`navigator.mediaDevices.getUserMedia()` rejected (permission denied, no camera,
camera busy, insecure context).

Root cause (`webcam-capture-dialog.tsx:48`): the `catch` block called the
synchronous, renderer-blocking `window.alert()` and then closed the dialog.
`alert()` blocks the Electron renderer process — the parent New Lead form and
the whole window stop responding until the native alert is dismissed, and on
some Windows/driver combos the app never recovers.

A second UX gap: the dialog rendered `<video>` immediately with no loading
state, so a slow camera start looked broken, and the Capture button was enabled
before any stream existed.

## Fix

`src/renderer/src/components/person/webcam-capture-dialog.tsx`:

- **Removed `window.alert()` entirely.** Camera failure now renders an inline
  `role="alert"` error panel (icon + message + Close/Retry) *inside* the
  capture dialog. The dialog stays open; the parent form stays alive.
- **`cameraStatus` state machine** (`'loading' | 'active' | 'error'`) with a
  `cameraError` message string:
  - `loading` → spinner overlay on the preview circle, Capture disabled.
  - `active` → live preview, Capture enabled.
  - `error` → error panel, Capture hidden, Close + Retry shown.
- **Classified error messages** via `cameraErrorMessage(err)`:
  - `NotAllowedError` → permission-denied guidance,
  - `NotFoundError` / `OverconstrainedError` → no-camera guidance,
  - `NotReadableError` → camera-busy guidance,
  - anything else → generic check-connection message.
- **Feature detection**: missing `navigator.mediaDevices?.getUserMedia`
  (insecure context / old runtime) throws `NotSupportedError` into the same
  inline error path instead of a `TypeError`.
- **Cleanup preserved**: `stopStream()` on unmount/close/retake/retry; per-open
  state reset on close so retries start fresh.

## Tests

- `tests/renderer/webcam-capture-dialog.test.tsx` (vitest, 4 tests):
  1. `NotAllowedError` → inline `role="alert"`, `window.alert` never called,
     dialog does not auto-close, Retry/Close present, Capture absent.
  2. `NotFoundError` → "no camera" message.
  3. Retry re-attempts `getUserMedia` and recovers on success.
  4. Capture is disabled while the camera is starting.
- `tests/e2e/camera-denied.spec.ts` (Playwright `_electron`, professional
  Electron E2E): launches the real built app (`out/main/index.js`) with a
  temp `userData` dir, completes org setup, opens New Lead from the dashboard,
  stubs `getUserMedia` to reject with `NotAllowedError` and spies on
  `window.alert` via `addInitScript`, then asserts the inline error renders,
  `alert` is never called, Retry re-attempts, and Close leaves the New Lead
  form open and interactive. Run with `npm run test:e2e` (requires
  `electron-vite build` first; Playwright browsers install not needed for the
  Electron project since it drives the app's own Chromium).
- `playwright.config.ts` + `"test:e2e": "playwright test"` script added.

## Verification

- New component tests: 4/4 pass.
- E2E: 1/1 passes against the real app (~11 s).
- `npm run typecheck:web`: clean. (`typecheck:node` has pre-existing errors
  in `src/main/lib/photo-storage.ts` and
  `src/main/application/person-photo.ts`, untouched by this change.)
- Full component suite: 157/158 pass in one loaded run; the single failure
  (`leads-page` bulk follow-up timeout) passes in isolation — flaky under
  load, unrelated to this change.
