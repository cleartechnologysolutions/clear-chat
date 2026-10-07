import {invalidateRoom} from './room-cache';
import { ensureRooms, roomExists } from "./rooms";
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

export { VideoRoom } from "./video-room";

interface Env {
  VIDEO_ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const cached = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]{1,60})\/messages$/);
    if(cached && request.method==='GET')return env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName('cache:'+cached[1])).fetch('https://internal/internal/cache?room='+cached[1]);
    // Protect every room transport before forwarding to the app or Durable Object.
    const roomPath = url.pathname.match(/^\/api\/(?:rooms|calls|bonks)\/([^/]+)/);
    if (roomPath || url.pathname === '/api/admin/messages') {
      try {
        await ensureRooms(env.DB);
        if (roomPath && !await roomExists(env.DB, roomPath[1]))
          return Response.json({error:'Room unavailable. Ask the admin for an existing room link.'}, {status:404,headers:{'Cache-Control':'no-store'}});
      } catch {
        return Response.json({error:'Room storage is unavailable. Please try again.'}, {status:503});
      }
    }
    const presence = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]{1,60})\/presence$/);
    if(presence){
      if(request.method!=='GET' && request.headers.get('Origin')!==url.origin)return new Response('Origin not allowed',{status:403});
      const body=(request.method==='POST'?await request.clone().json().catch(()=>({})): {}) as {action?:string};
      const response=await env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName('presence:'+presence[1])).fetch(request);
      if(response.ok && (body.action==='join'||body.action==='leave'))await invalidateRoom(env.VIDEO_ROOMS,presence[1]);
      return response;
    }
    const bonks = url.pathname.match(/^\/api\/bonks\/([a-z0-9-]{1,60})$/);
    if (bonks) {
      if (request.headers.get("Origin") !== url.origin) return new Response("Origin not allowed", {status:403});
      if (!env.VIDEO_ROOMS) return Response.json({error:"Deploy the complete configuration to enable bonks."},{status:503});
      return env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName("bonks:"+bonks[1])).fetch(request);
    }
    const call = url.pathname.match(/^\/api\/calls\/([a-z0-9-]{1,60})(?:\/ice)?$/);
    if (call) {
      if (request.headers.get("Origin") !== url.origin) return new Response("Origin not allowed", {status:403});
      if (!env.VIDEO_ROOMS) return new Response("Video binding missing. Deploy the complete Build 12 configuration.", {status:503});
      return env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName(call[1])).fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const adminMutation=url.pathname==='/api/admin/messages' && ['POST','DELETE'].includes(request.method);
    const mutation=(adminMutation?await request.clone().json().catch(()=>({})):null) as {roomSlug?:string;action?:string}|null;
    const response=await handler.fetch(request, env, ctx);
    if(response.ok){
      const rooms=new Set<string>();
      if(cached && request.method==='POST')rooms.add(cached[1]);
      if(adminMutation){
        if(mutation?.roomSlug)rooms.add(String(mutation.roomSlug).trim().toLowerCase());
        if(mutation?.action==='cleanup-old'){
          const registered=await env.DB.prepare('SELECT slug FROM chat_rooms').all<{slug:string}>();
          for(const room of registered.results)rooms.add(room.slug);
        }
      }
      for(const room of rooms){
        try{await invalidateRoom(env.VIDEO_ROOMS,room);}catch(error){console.error(error);ctx.waitUntil(invalidateRoom(env.VIDEO_ROOMS,room).catch(console.error));}
      }
    }
    return response;
  },
};

export default worker;
