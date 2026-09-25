# Chat Build 12 — two-person video and screen sharing

## Deploy

1. Replace the existing repository files with this ZIP's contents, including `vite.config.ts` and the `worker` folder, then deploy as usual.
2. Keep your existing DB, CHAT_IMAGES, and KLIPY_API_KEY settings.
3. The included configuration creates the VIDEO_ROOMS Durable Object binding and its SQLite class automatically during deployment. No D1 SQL changes or new R2 bucket are needed. Do not delete the existing Worker.

## Configure Cloudflare's TURN relay

A direct browser-to-browser call may work without this, but relay setup is needed for networks that block direct connections.

1. Open https://dash.cloudflare.com/?to=/:account/calls and select your account. Look for Realtime / TURN and create a TURN key.
2. Copy its Key ID and the associated API token.
3. Open your Chat Worker → Settings → Runtime variables and secrets. Add:
   - TURN_KEY_ID: Text, containing that TURN Key ID.
   - TURN_API_TOKEN: Secret, containing that key's API token.
4. Save/deploy the settings and refresh Chat.

Use the TURN key's API token, not your Cloudflare Global API Key. The application generates one-hour credentials on the server and refreshes them during longer calls. Long-term credentials are never included in the browser bundle.

Cloudflare's credential setup documentation:
https://developers.cloudflare.com/realtime/turn/generate-credentials/

Cloudflare's published Realtime allowance is the first 1,000 GB/month free, shared between SFU and TURN, with $0.05/GB egress after that. Workers and Durable Objects have their own quotas/pricing. Confirm current terms in your account:
https://developers.cloudflare.com/realtime/sfu/platform/pricing/

## Use it

Both people open the same chat room and press Start / join video. Camera and microphone permission is requested only after clicking. Select Join without camera for audio-only. Share screen replaces your camera feed until you stop sharing. Microphone audio continues; system/tab audio is not captured.

Two people can join the call. Additional people can still use text chat, images, and GIFs. The third caller sees a room-full message and their local media tracks are stopped. Hang up leaves text chat open. Changing rooms also ends your call and releases your devices. Anyone with the room link can join an available call slot; this is not an authenticated meeting service.

## Final live check

After setting TURN credentials, test from two different devices/networks (for example Wi-Fi and cellular). Use headphones to avoid feedback. Confirm audio in both directions, video, screen sharing, stopping screen sharing, and hanging up. Test the supported desktop browsers you use; mobile screen sharing depends on browser support.

The build, TypeScript checks, actual signaling/room-limit tests, and browser control/cleanup tests passed locally. Native WebRTC offer/answer exchange was verified. The execution environment did not produce usable ICE candidates, so media transport was not verified here; the connected state was simulated for the UI control tests. A real call after deployment is still required to validate your TURN credentials and network conditions.

## Troubleshooting

- Relay not configured: add BOTH runtime variables above. Calls currently attempt direct/STUN connections only.
- Relay setup failed: confirm the TURN Key ID and its associated API token, then hang up and rejoin.
- Video connection failed: confirm the entire ZIP was deployed and VIDEO_ROOMS appears under bindings.
- Permission denied: allow camera/microphone for this site in the browser's site permissions.
- No devices: use audio-only if there is a microphone but no camera. A microphone is required in this version.
- Call full: two people are already in video; text chat is unaffected. Disconnected slots expire automatically, at most about 150 seconds after their last heartbeat.
- Connection lost: hang up/rejoin. The app does not silently reopen devices or reconnect after a dropped signaling connection.

No recording or server-side storage of audio/video is implemented. R2 continues to hold chat image uploads only.
