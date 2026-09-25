# Build 17: Escape, bonks, and contained scrolling

- Escape closes the emoji/GIF picker and returns focus to the message box. It also closes participant action menus.
- Click another person's name, then 🔔 Bonk. The recipient sees a banner and hears a louder gong if sound is enabled and their browser has been unlocked by a click/key interaction. Bonks target the exact display name in the room; duplicate names receive the same bonk. The sender does not hear it. This is not a system-volume override.
- Cooldowns: 20 seconds per recipient and 10 seconds per sending network in the room. Offline recipients do not receive old bonks on joining; active pages poll every 2.5 seconds. Background tab suspension can delay delivery. Events expire after 90 seconds; stored attention state is cleared after inactivity.
- The app stays within the visible viewport. Only the sidebar and messages scroll; dark scrollbars match the app. Verified at desktop, short-window, and mobile dimensions.

Deploy the entire ZIP. No D1 migration or new environment variable is needed. Bonks reuse the existing VIDEO_ROOMS binding in separate attention instances; TURN is only needed for video relay, not bonks.

# Build 16: bold participant colors

First four participants use blue, yellow, red, and green, in that order. Stronger five-pixel accent borders and background tints improve separation. Names and two-letter badges remain visible. Colors are assigned in first-message order in the displayed conversation. No settings or database changes.

# Build 15: clearly separated participant colors

Assigns the room palette in first-message order: blue, gold, green, pink, purple, orange, teal, red. Removes name hashing so similar hash-selected shades are not assigned to the first few participants. Two-letter badges and grouping are preserved. No configuration or database changes.

# Build 14: distinct participant colors

Resolves palette collisions within the displayed conversation (including Alicia/Adam). Adds two-letter badges such as AL and AD. Existing assigned colors stay the same as new participants append messages. No settings or database changes.

# Build 13: author colors, message grouping, and sound

Each display name has a consistent accent color and initial badge. Consecutive messages from that exact name appear in one block; another name starts a new block. Text, uploaded images, and GIFs remain in chronological order. This app uses display names rather than accounts, so people using the same name share the same color/grouping; choose distinct names.

Incoming messages trigger a brief two-tone chime after the browser has received a click or keypress. Use the Message sound button to enable/mute; the choice is remembered on this browser. No chime for initial history or successfully sent local messages. One chime plays per received batch, independently of desktop notifications. Suspended/background browser tabs or OS sound restrictions can delay/prevent audio. Existing polling typically discovers new messages within 2.5 seconds while active.

No new Cloudflare settings or database migrations are needed for Build 13.

# Build 12: two-person video calls

See VIDEO-SETUP.md for Cloudflare TURN setup and the final two-device test. Includes camera, microphone, screen sharing, hang-up, and a two-person call limit independent of text chat. No D1 migration.

# Build 11: automatic emoticons

Standalone emoticons convert after Space or Send: :) :D :P ;) :( :O :/ :| and <3, including common nose variants. URLs stay unchanged. No new configuration or database changes.

# Build 10: GIF search and image links

See GIF-SETUP.md to add KLIPY_API_KEY as a Cloudflare runtime secret. No database changes.

# Build 9 — keyboard focus fix

The message field keeps focus during sending and receives focus again after Send, including failed sends. Enter sends as before. No database or bucket changes needed.

# Build 8 branding update

Removed the CTS badge and company name from Chat, the admin page, and browser metadata. Existing image storage and database setup stays the same. If Build 7 is working, simply replace files and deploy; no SQL changes needed.

# Chat Build 8 — inline pictures

Read **IMAGE-SETUP.md** first. This update requires the `image_key` D1 column and a private R2 bucket named `chat-images`.

# Clear Technology Solutions Chat

A simple Cloudflare Worker chat-room app for `chat.cleartechnologysolutions.com`.

Rooms are created by URL code, like `/abcd`. Anyone with a room link can open the room and send short messages. Messages are stored in Cloudflare D1.

## D1 setup

Run this in the D1 database before testing chat:

```sql
CREATE TABLE `messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `room_slug` text NOT NULL,
  `display_name` text NOT NULL,
  `body` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `idx_messages_room_created` ON `messages` (`room_slug`,`created_at`);
```

## Cloudflare deployment

Use:

```text
Build command: chmod +x scripts/*.sh && npm run build
Deploy command: npx wrangler deploy
```

The Worker name is `clear-chat`. After deployment, add `chat.cleartechnologysolutions.com` as the custom domain.

## Starter notes

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from `oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
