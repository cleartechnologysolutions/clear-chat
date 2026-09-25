# Chat Build 7 — inline image messages

## One-time setup before deploying

1. In your existing Cloudflare account, open R2 Object Storage and create a **private** bucket named `chat-images`. Do not enable public access or add a 24-hour expiration rule. Images remain until their messages are deleted through the app's admin controls.
2. Open the D1 database bound as **DB on your Chat Worker** → Console, and run this once:

```sql
ALTER TABLE messages ADD COLUMN image_key text;
```

This adds an optional column and keeps all existing messages. If it says `duplicate column name: image_key`, it has already been added; do not rerun or delete the table. The same SQL is in `drizzle/0001_chat_images.sql`.

3. Replace the matching files in your existing Chat repository and commit. Keep your current DB name and ID in `vite.config.ts` if you customized them. The included config adds `CHAT_IMAGES` → `chat-images` to the generated Worker configuration.
4. Keep your existing build command (`chmod +x scripts/*.sh && npm run build`) and deploy command (`npx wrangler deploy`). Keep the existing Worker, domain and ADMIN_PASSWORD secret.
5. Reload Chat and look for **Build 7**. Choose Attach image or paste into the message box, optionally enter a caption, then Send. A preview appears before sending. Nothing uploads until Send.

If adding the R2 binding manually: Chat Worker → Bindings → Add binding → R2 bucket, variable name `CHAT_IMAGES`, bucket `chat-images`.

## Behavior

- One image per message; send more messages for more pictures.
- PNG, JPEG, WebP, GIF; maximum 10 MiB (shown as 10 MB). Original bytes, no compression/resizing.
- Pictures display inside message bubbles. Click to enlarge; Close image or Escape closes the viewer.
- Pictures arrive with the normal automatic chat updates. No separate gallery or manual refresh needed.
- Text-only and image-only messages both work. A failed send keeps the draft and attachment for retry.
- The admin reader shows pictures inline too. Delete room and the manual 30-day cleanup remove associated R2 images in batches as well as messages. There is no automatic 30-day deletion.
- Anyone with the room link can read its messages and pictures. The R2 bucket itself stays private.
- The image endpoint checks that the message still exists in that room. Deleting messages directly in D1 bypasses physical R2 cleanup; use the admin controls.

## Validation

`npm run build`, then `node tests/images.integration.mjs` runs local D1/R2 tests for captions, image-only and text-only posts, unchanged image bytes, invalid and oversized uploads, room scoping and admin cleanup. Browser checks also covered two readers, automatic arrival, preview, paste, enlarged view and retry after a failed send.
