import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { messages } from "../../../../../db/schema";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_NAME_LENGTH = 32;

function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function cleanName(raw: string | undefined) {
  return (raw || "Guest").trim().slice(0, MAX_NAME_LENGTH) || "Guest";
}

function cleanBody(raw: string | undefined) {
  return (raw || "").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "Storage is not ready yet. Create the messages table in D1 first.";
  }
  return message;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    if (!slug) {
      return Response.json({ error: "Room name is required." }, { status: 400 });
    }

    const url = new URL(request.url);
    const afterId = Number(url.searchParams.get("after") || "0");
    const db = getDb();

    const rows =
      afterId > 0
        ? await db
            .select()
            .from(messages)
            .where(and(eq(messages.roomSlug, slug), gt(messages.id, afterId)))
            .orderBy(desc(messages.id))
            .limit(100)
        : await db
            .select()
            .from(messages)
            .where(eq(messages.roomSlug, slug))
            .orderBy(desc(messages.id))
            .limit(100);

    return Response.json({
      room: slug,
      messages: rows.reverse().map((message) => ({
        id: message.id,
        roomSlug: message.roomSlug,
        displayName: message.displayName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    const body = (await request.json()) as {
      displayName?: string;
      body?: string;
    };
    const displayName = cleanName(body.displayName);
    const messageBody = cleanBody(body.body);

    if (!slug) {
      return Response.json({ error: "Room name is required." }, { status: 400 });
    }

    if (!messageBody) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const db = getDb();
    const createdAt = new Date();
    const [message] = await db
      .insert(messages)
      .values({ roomSlug: slug, displayName, body: messageBody, createdAt })
      .returning();

    return Response.json({
      message: {
        id: message.id,
        roomSlug: message.roomSlug,
        displayName: message.displayName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
