// Bindings supplied by vite.config.ts (Wrangler's root config omits these).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CHAT_IMAGES: R2Bucket;
    VIDEO_ROOMS: DurableObjectNamespace;
    TURN_KEY_ID?: string;
    TURN_API_TOKEN?: string;
    KLIPY_API_KEY?: string;
  }
}
