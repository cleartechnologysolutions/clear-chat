# Chat Build 10 — GIF search and image links

1. Upload these project files to the existing repository and deploy.
2. In Cloudflare, open the Chat Worker → Settings → Runtime variables and secrets → Add variable.
3. Choose Secret. Name it KLIPY_API_KEY and paste your KLIPY key as the value. Save/deploy the change.
4. Refresh Chat. Open 😀 → GIFs, search, choose a GIF, then press Send.

No database migration or new bucket is needed. Keep your existing DB and CHAT_IMAGES bindings.

Direct HTTPS image URLs ending in .gif, .png, .jpg, .jpeg, .webp, or .avif display inline instead of as URLs, including URLs with query strings. GIPHY /gifs/ and /embed/ page links also work. Up to four linked images render per message. Other links remain text. Click an image to open its source; if loading fails, its link remains visible. Remote images depend on their host remaining available and permitting embedding; they are not copied into R2. Copied still frames cannot recover animation—paste the GIF link instead.

The GIF picker uses KLIPY through the Worker so the key is not sent to the browser. Search runs when you press Search or Enter; not on every keystroke. KLIPY test keys have a 100-call/hour limit; production access is requested in their partner panel. Configure content filtering there. Set ads/monetization off for this GIF-only integration.
