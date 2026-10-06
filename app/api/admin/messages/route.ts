import {colorsFor} from '../../../../worker/author-colors';
import {presenceList} from "../../../../worker/presence";
import { imageBucket, messageImage } from "../../../chat-images";
import { and, desc, eq, lt, inArray, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { messages } from "../../../../db/schema";

const FALLBACK_ADMIN_PASSWORD = "@dm!N4CtS";

function getAdminPassword() {
  const value = (env as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD;
  return typeof value === "string" && value ? value : FALLBACK_ADMIN_PASSWORD;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "Storage is not ready yet. Create the messages table in D1 first.";
  }
  return message;
}

function normalizeSlug(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
const reserved = new Set(['admin','api','favicon','_next','_vinext']);
export async function POST(request: Request) {
  if (getBearerToken(request) !== getAdminPassword()) return Response.json({error:'Wrong password.'},{status:401});
  const body = await request.json().catch(()=>({})) as {roomSlug?:string};
  const slug = normalizeSlug(body.roomSlug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60 || reserved.has(slug))
    return Response.json({error:'Use 1–60 letters, numbers, or single hyphens. Choose a non-reserved room code.'},{status:400});
  try {
    const result = await env.DB.prepare('INSERT OR IGNORE INTO chat_rooms (slug, created_at) VALUES (?, ?)').bind(slug,Date.now()).run();
    if (!result.meta.changes) return Response.json({error:'That room already exists or is being deleted.'},{status:409});
    return Response.json({ok:true,roomSlug:slug},{status:201});
  } catch { return Response.json({error:'Could not create the room.'},{status:500}); }
}

export async function GET(request: Request) {
  try {
    if (getBearerToken(request) !== getAdminPassword()) {
      return Response.json({ error: "Wrong password." }, { status: 401 });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(500);

    const colors=await colorsFor(env.DB,rows.slice().reverse().map(m=>m.displayName));
    const rooms = new Map<
      string,
      {
        roomSlug: string;
        latestAt: string;
        messageCount: number;
        messages: Array<{
          id: number;
          displayName: string;
          authorColor?: string;
          body: string;
          imageUrl: string | null;
          createdAt: string;
        }>;
      }
    >();

    const registered = await env.DB.prepare('SELECT slug, created_at FROM chat_rooms ORDER BY created_at DESC').all<{slug:string;created_at:number}>();
    for (const room of registered.results) rooms.set(room.slug, {roomSlug:room.slug,latestAt:new Date(room.created_at).toISOString(),messageCount:0,messages:[]});
    for (const message of rows) {
      if (!rooms.has(message.roomSlug)) continue;
      const room = rooms.get(message.roomSlug) ?? {
        roomSlug: message.roomSlug,
        latestAt: message.createdAt.toISOString(),
        messageCount: 0,
        messages: [],
      };

      if (!room.messageCount) room.latestAt = message.createdAt.toISOString();
      room.messageCount += 1;
      room.messages.push({
        id: message.id,
        displayName: message.displayName,
        authorColor: colors.get(message.displayName.trim().toLowerCase()),
        body: message.body,
        imageUrl: messageImage(message),
        createdAt: message.createdAt.toISOString(),
      });
      rooms.set(message.roomSlug, room);
    }

    return Response.json({
      rooms: await Promise.all(Array.from(rooms.values()).map(async (room) => ({
        ...room,
        messages: room.messages.reverse(),
        participants: await presenceList(env.DB,room.roomSlug),
      }))),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (getBearerToken(request) !== getAdminPassword()) {
      return Response.json({ error: "Wrong password." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      roomSlug?: string;
      name?: string;
    };
    const db = getDb();

    if (body.action === 'remove-participant') {
      const roomSlug=normalizeSlug(body.roomSlug);const name=typeof body.name==='string'?body.name.trim().slice(0,32):'';
      if(!roomSlug||!name)return Response.json({error:'Select a participant.'},{status:400});
      // Retire active sessions first; old heartbeats cannot silently add the person back.
      await env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName('presence:'+roomSlug)).fetch('https://internal/internal/remove-participant?room='+encodeURIComponent(roomSlug),{method:'POST',body:JSON.stringify({name})});
      await deleteMatching(and(eq(messages.roomSlug,roomSlug),eq(messages.displayName,name))!);
      await env.DB.batch([env.DB.prepare('DELETE FROM chat_events WHERE room=? AND name=?').bind(roomSlug,name),env.DB.prepare('DELETE FROM chat_participants WHERE room=? AND name=?').bind(roomSlug,name)]);
      return Response.json({ok:true});
    }
    if (body.action === "cleanup-old") {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await deleteMatching(lt(messages.createdAt, cutoff));
      await env.DB.prepare('DELETE FROM chat_events WHERE created_at < ?').bind(cutoff.getTime()).run();
      return Response.json({ ok: true });
    }

    if (body.action === "delete-room") {
      const roomSlug = normalizeSlug(body.roomSlug);
      if (!roomSlug) {
        return Response.json({ error: "Pick a room first." }, { status: 400 });
      }

      // Disable first: concurrent posts cannot recreate messages during cleanup.
      await env.DB.prepare('UPDATE chat_rooms SET active = 0 WHERE slug = ?').bind(roomSlug).run();
      if (env.VIDEO_ROOMS) {
        for (const key of [roomSlug, 'bonks:'+roomSlug, 'presence:'+roomSlug]) {
          await env.VIDEO_ROOMS.get(env.VIDEO_ROOMS.idFromName(key)).fetch('https://internal/internal/delete-room', {method:'POST'});
        }
      }
      await deleteMatching(eq(messages.roomSlug, roomSlug));
      await env.DB.batch(['chat_participants','chat_sessions','chat_events'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE room=?`).bind(roomSlug)));
      await env.DB.prepare('DELETE FROM chat_rooms WHERE slug = ? AND active = 0').bind(roomSlug).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown admin action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

async function deleteMatching(condition: SQL) {
  const db = getDb();
  while (true) {
    const batch = await db.select().from(messages).where(condition).limit(100);
    if (!batch.length) return;
    const keys = batch.flatMap(message => message.imageKey ? [message.imageKey] : []);
    if (keys.length) {
      const bucket = imageBucket();
      if (!bucket) throw new Error('Image storage unavailable. Nothing in this batch was deleted; restore CHAT_IMAGES and retry.');
      await bucket.delete(keys);
    }
    await db.delete(messages).where(inArray(messages.id, batch.map(message => message.id)));
  }
}
