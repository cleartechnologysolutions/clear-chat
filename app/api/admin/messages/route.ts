import { desc, eq, lt } from "drizzle-orm";
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
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 32)
    : "";
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

    const rooms = new Map<
      string,
      {
        roomSlug: string;
        latestAt: string;
        messageCount: number;
        messages: Array<{
          id: number;
          displayName: string;
          body: string;
          createdAt: string;
        }>;
      }
    >();

    for (const message of rows) {
      const room = rooms.get(message.roomSlug) ?? {
        roomSlug: message.roomSlug,
        latestAt: message.createdAt.toISOString(),
        messageCount: 0,
        messages: [],
      };

      room.messageCount += 1;
      room.messages.push({
        id: message.id,
        displayName: message.displayName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      });
      rooms.set(message.roomSlug, room);
    }

    return Response.json({
      rooms: Array.from(rooms.values()).map((room) => ({
        ...room,
        messages: room.messages.reverse(),
      })),
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
    };
    const db = getDb();

    if (body.action === "cleanup-old") {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await db.delete(messages).where(lt(messages.createdAt, cutoff));
      return Response.json({ ok: true });
    }

    if (body.action === "delete-room") {
      const roomSlug = normalizeSlug(body.roomSlug);
      if (!roomSlug) {
        return Response.json({ error: "Pick a room first." }, { status: 400 });
      }

      await db.delete(messages).where(eq(messages.roomSlug, roomSlug));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown admin action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
