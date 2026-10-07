# Chat Build 26 — lower D1 usage

Upload this package over the existing repository and deploy with the existing commands:

Build: `chmod +x scripts/*.sh && npm run build`
Deploy: `npx wrangler deploy`

Keep the existing DB, CHAT_IMAGES and VIDEO_ROOMS bindings. Do not delete the Worker or database. No new database or Durable Object migration is required. Indexes install automatically on the first request; the initial index build does require D1 access and reads existing data once.

After deployment, reload open chat tabs once. The header should say Build 26.

Changes:
- One shared room snapshot per room serves repeated browser polls, instead of reading D1 for each visitor every 2.5 seconds.
- Successful messages, images, joins, leaves and admin changes invalidate that snapshot. Refresh also reconciles with D1 at least every 30 seconds while the room is requested.
- Composite indexes support room history and presence queries; date indexes support cleanup.
- User color assignments are cached without changing the stored assignments.
- Presence heartbeats change from 20 to 60 seconds; heartbeats no longer read the whole participant list. Background tabs continue heartbeats when the browser permits them.
- Storage failures back off for one minute at the shared cache and browser levels.

This version retains polling against the shared cache. It does not switch message delivery to WebSockets. Actual account usage depends on room activity, browser behavior, and other apps. Existing daily quota exhaustion still requires the quota reset or a plan change.

Validation: TypeScript and production build; shared cache unit test with 100 idle polls causing zero additional message/event reads; invalidation, expiry, quota backoff/recovery; browser tab-recovery logic; Miniflare presence, text/image posting, participant deletion, room creation/deletion and video transport gates.
