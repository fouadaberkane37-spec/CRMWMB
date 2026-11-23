# Codex task: turn ZF CRM into an App Store–ready iOS app (Capacitor) with push notifications

## Context (read first)
- Repo: GitHub `fouadaberkane37-spec/CRMWMB` (may be renamed `CRMZF`). Base branch: **`claude/nifty-chaplygin`**. Create and work on a new branch **`codex/ios-app`**. Do not push to the base branch.
- Product: **ZF CRM**, the field-service CRM of ZF Entretien (window cleaning, Quebec). The UI is French-first. About 5 users: owner, technicians, sales reps (door-to-door). Mostly iPhones.
- Stack:
  - Backend: FastAPI + SQLAlchemy in `backend/`. Startup migrations live in `backend/main.py`: `create_all` plus guarded `ALTER TABLE` lists. Use that pattern; there's no Alembic.
  - Frontend: React 18 + Vite + Tailwind + lucide-react in `frontend/`.
  - A Capacitor 6 config already exists in `frontend/capacitor.config.ts`: appId `com.team.crm`, `webDir: dist`. There's no `ios/` folder yet. API base URL comes from `VITE_API_URL` (`frontend/src/api.js`).
- Tests: `backend/tests` (pytest, 24 passing). Run them with `python -m pytest backend/tests -q`. The frontend build is `cd frontend && npm run build`. Both must pass at the end.
- Offline mode already exists. Don't rewrite it; make it work inside the native app.
  - `frontend/src/offline.js` is an IndexedDB outbox (map pins, bookings, photos) with auto-sync.
  - Backend: `/api/sync/*` with idempotent `client_ref` receipts, and `/api/attachments` for photos.
  - `frontend/public/sw.js` is a service worker that caches the app shell, a few GET lists and OSM map tiles.
- Map: Leaflet + OSM in `frontend/src/pages/KnockMap.jsx`, `TeamMap.jsx` and `frontend/src/mapPins.js`.
- Booking with camera photos: `frontend/src/pages/Booking.jsx`. Job photos: `frontend/src/components/JobPhotos.jsx`.
- Security headers and CORS are in `backend/main.py`. `ALLOWED_ORIGINS` env var; CSP; Permissions-Policy.
- Nobody has a Mac. iOS builds must run in the cloud (Codemagic). The owner is enrolling in the Apple Developer Program as an Organization. Bundle id and Team ID are not known yet, so make them configurable.

## Goal
An iOS app that Apple will accept (it must not be judged a "thin web wrapper" under guideline 4.2). It needs to:
- work offline (map pins, bookings, photos sync later)
- use the camera and GPS natively
- receive push notifications

The PWA must keep working exactly as today.

## Tasks

### 1. Capacitor iOS project
- Set `appId` from an env var with default `ca.zfentretien.crm`, and `appName` to `ZF CRM`.
- Run `npx cap add ios` and commit the `ios/` folder. CocoaPods won't run on Linux; that's fine. Make sure the project is valid for a cloud build.
- Add the plugins:
  - `@capacitor/geolocation`
  - `@capacitor/camera`
  - `@capacitor/push-notifications`
  - `@capacitor/network`
  - `@capacitor/preferences`
  - `@capacitor/splash-screen`
  - `@capacitor/status-bar`
  - `@capacitor/app`
- Info.plist usage strings, French first with English. Each one must be specific about why:
  - `NSCameraUsageDescription`: photos of the customer's requests on a job
  - `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription`
  - `NSLocationWhenInUseUsageDescription`: show your position on the door-to-door map and place pins
- Background mode `remote-notification`. Push capability via the entitlements file, with `aps-environment` driven by the build config.
- App icon and splash: generate them with `@capacitor/assets` from `frontend/public/icon-512.svg` (convert to a 1024×1024 PNG first). Brand colors: dark `#0a0b0d`, blue `#5b8eff`.
- Set `server.iosScheme` / hostname so that `capacitor://localhost` works. Add `capacitor://localhost` and `ionic://localhost` to the backend CORS defaults (`ALLOWED_ORIGINS` handling in `main.py`), without opening it to `*` in production.

### 2. Make offline work inside the native app (no service worker in WKWebView)
- The IndexedDB outbox already works in WKWebView; keep it.
- Detect native with `Capacitor.isNativePlatform()`. In native, use `@capacitor/network` for online/offline events in `offline.js`; keep `navigator.onLine` for the web.
- Replace what the service worker does for data in native:
  - Add a small read-through cache for the GET lists used offline: `/knocks/`, `/contacts/`, `/deals/`, `/services`, `/auth/me`.
  - Put it in IndexedDB, behind an axios interceptor in `api.js`: on a network error, return the last cached response.
  - In native, clear this cache on logout, like the web logout does.
- Map tiles offline in native: add a Leaflet tile layer that caches tiles in IndexedDB. Use something like `leaflet.offline`, or a small custom `L.TileLayer` subclass. Cap it at about 3000 tiles.
  - Add an optional "Télécharger la zone" button on the D2D map to pre-cache the visible area at zoom 13–17.
  - Respect the OSM tile usage policy: no bulk downloads beyond a reasonable area, and keep the attribution.
- Native camera: in `Booking.jsx` and `JobPhotos.jsx`, use `@capacitor/camera` (quality about 80, width 1600, `resultType` Uri → fetch → Blob) when native. Keep the `<input type=file capture>` path for the web. Feed the same `compressImage`/`enqueue('photo', …)` flow.
- Native geolocation: in `KnockMap.jsx`, use `@capacitor/geolocation` when native (watchPosition). Keep `navigator.geolocation` for the web.
- Safe areas and status bar: check the notch / home indicator on the map, bottom nav and drawers. Use `env(safe-area-inset-*)`, which is already partly done.

### 3. Push notifications (APNs direct, iOS first; no Firebase)
**Backend**
- New model `Device`: `user_id`, `platform` (`ios`|`android`|`web`), `token` (unique), `app_version`, `last_seen_at`, `enabled`.
- New model `NotificationPref` per user. Booleans: `new_lead`, `job_assigned`, `customer_reply`, `quote_accepted`, `invoice_paid`. Defaults by role:
  - owner/admin: all on
  - technician: `job_assigned` only
  - sales: `new_lead`, `customer_reply`, `quote_accepted`
- Routes:
  - `POST /api/devices` (register/refresh the token for the current user)
  - `DELETE /api/devices/{token}`
  - `GET/PUT /api/me/notification-prefs`
- `backend/push.py`:
  - Send through APNs HTTP/2 with a `.p8` token key. Use `httpx[http2]` plus a JWT signed with ES256 (`python-jose`/`cryptography` are already present). Alternatively use the `aioapns` lib, run in a background thread.
  - Env vars: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` (file path or PEM content), `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX`.
  - If they're not configured, log and no-op; never crash a request.
  - Remove tokens that APNs reports as `BadDeviceToken` or `Unregistered`.
  - Send in a FastAPI `BackgroundTasks`/thread so requests stay fast.
- Wire the triggers. Find the right spots; don't duplicate logic.
  - **New lead:** inbound unknown SMS in `routes/twilio.py` (`upsert_inbound_lead`), and the Blue work bridge lead import. Bulk imports must NOT push for every row; at most one summary push.
  - **Job assigned / rescheduled:** to that tech (`routes/deals.py` tech assignment, `routes/availability.py` auto-assign, reschedule).
  - **Customer SMS reply:** `routes/twilio.py` `save_inbound_message`.
  - **Quote accepted:** public accept in `routes/quotes.py`.
  - **Invoice paid:** `routes/billing.py`, when status becomes `paid`.
- Payload: French title/body, plus a `url` deep-link path, e.g. `/calendar?deal=ID`, `/quotes/ID`, `/chats`.
- Quiet hours 21:00–07:00 America/Toronto. Hold notifications or mark them `interruption-level: passive`.
- Tests:
  - device register/unregister
  - prefs defaults by role
  - each trigger calls `push.send_to_users` (mock it)
  - no push when prefs are off
  - unconfigured APNs is a no-op

**Frontend**
- In native, after login, request permission and register. On `registration`, POST the token to `/api/devices`.
- On `pushNotificationActionPerformed`, navigate to `data.url`.
- Add a Settings page "Notifications" (route `/settings/notifications`, linked in the Sidebar Settings group and the BottomNav "More" drawer) with the per-user toggles.

### 4. App Store review requirements
- Public privacy policy page `/privacy`, in French + English, reachable without login (add it to the public routes in `App.jsx`). It must cover:
  - what is collected: customer contact data entered by staff, location while using the map, photos, device push token
  - why, where it is stored (Canada), retention, and the contact address placeholder `{{PRIVACY_CONTACT_EMAIL}}`
- In-app account deletion (guideline 5.1.1(v)):
  - "Supprimer mon compte" in a user menu/settings page
  - It deactivates the user, removes their devices and personal fields, and keeps business records (jobs, invoices) attributed to "Ancien utilisateur".
  - Admins cannot delete the last admin.
  - Add tests.
- A reviewer demo account: script `scripts/create_review_account.py`. It creates the user `appreview` with a random password printed once, a technician-like role, and seeded demo data limited to that account's view. Don't run it against production in CI.
- `docs/APP_STORE.md` must contain:
  - the App Store listing text in French + English (name, subtitle, description, keywords)
  - the review notes text (internal business tool, demo credentials placeholder, how to test offline / camera / push)
  - the privacy "nutrition label" answers matching what the app actually collects
  - the age rating, the category (Business) and the export compliance answer (uses only standard HTTPS)

### 5. Cloud build (no Mac): Codemagic
- Add `codemagic.yaml` with a workflow `ios-testflight`:
  - Node 20: `npm ci`, `npm run build` with `VITE_API_URL` from the env group
  - `npx cap sync ios`
  - pod install
  - automatic code signing via the App Store Connect API key, from an env group `appstore_credentials` (`APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_IDENTIFIER`, `APP_STORE_CONNECT_PRIVATE_KEY`, `CERTIFICATE_PRIVATE_KEY`)
  - an incrementing build number
  - publish to TestFlight
- Also add a GitHub Actions workflow `.github/workflows/ci.yml` that runs pytest and the frontend build on every push/PR. Linux only.
- `docs/IOS_SETUP.md` is a step-by-step guide for a non-developer owner. It covers:
  1. Apple Developer enrollment
  2. Creating the App ID with Push capability
  3. Creating the APNs `.p8` key
  4. Creating the App Store Connect API key
  5. Creating the app record in App Store Connect
  6. Codemagic sign-up, connecting the repo, adding the env groups
  7. Setting the APNS_* env vars on the server
  8. The first TestFlight build and inviting the team

  Mark clearly which steps only the owner can do (payments, legal agreements, 2FA).

## Constraints
- **Never commit secrets** (.p8 keys, passwords, tokens, `.env`). Use env vars and add `.gitignore` entries.
- Don't change business logic, prices/taxes (`backend/money.py`), the sync idempotency, or the startup-safety behaviour. `backend/tests/test_startup_safety.py` must stay green.
- Keep the web/PWA path working: every native code path must be behind `Capacitor.isNativePlatform()`.
- Keep the UI French-first, matching the existing dark style and the ZF blue `#5b8eff`.
- Don't use `datetime.utcnow()` in new code; use `datetime.now(timezone.utc)`.
- Make small, focused commits with clear messages.

## Definition of done
- `python -m pytest backend/tests -q`: all pass, with new tests for devices, prefs, push triggers (mocked) and account deletion.
- `cd frontend && npm run build` passes, and `npx cap sync ios` succeeds (pods may be skipped on Linux).
- `ios/` is committed. `codemagic.yaml`, `.github/workflows/ci.yml`, `docs/IOS_SETUP.md` and `docs/APP_STORE.md` exist.
- Branch `codex/ios-app` is pushed. Open a PR into `claude/nifty-chaplygin` whose description lists:
  - what changed
  - how it was tested
  - the exact manual steps left for the owner
  - any assumption you made (bundle id, etc.)
