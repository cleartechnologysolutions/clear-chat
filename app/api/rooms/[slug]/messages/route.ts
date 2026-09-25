import { boundedBody, imageBucket, imageType, MAX_IMAGE, messageImage } from "../../../../chat-images";
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
        imageUrl: messageImage(message),
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: routeError(error).includes("Upload too large") ? 413 : 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'Invalid origin.'},{status:403});
    const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data');
    let body: {displayName?: string; body?: string};
    let imageBytes: Uint8Array | null = null;
    let contentType: string | null = null;
    const raw = await boundedBody(request, multipart ? MAX_IMAGE + 16384 : 16384);
    if (multipart) {
      const form = await new Request(request.url, {method:'POST',headers:{'content-type':request.headers.get('content-type')!},body:raw}).formData();
      body = {displayName:String(form.get('displayName') || ''),body:String(form.get('body') || '')};
      const file = form.get('image');
      if (!(file instanceof File) || !file.size) return Response.json({error:'Choose an image.'},{status:400});
      if (file.size > MAX_IMAGE) return Response.json({error:'Images must be 10 MB or smaller.'},{status:413});
      imageBytes = new Uint8Array(await file.arrayBuffer()); contentType = imageType(imageBytes);
      if (!contentType) return Response.json({error:'Use a PNG, JPEG, WebP, or GIF image.'},{status:415});
      if (!imageBucket()) return Response.json({error:'Image storage is not configured. Add the CHAT_IMAGES R2 binding.'},{status:503});
    } else { body = JSON.parse(new TextDecoder().decode(raw)); }
    const displayName = cleanName(typeof body.displayName === 'string' ? body.displayName : undefined);
    const messageBody = cleanBody(typeof body.body === 'string' ? body.body : undefined);

    if (!slug) {
      return Response.json({ error: "Room name is required." }, { status: 400 });
    }

    if (!messageBody && !imageBytes) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const db = getDb();
    const createdAt = new Date();
    const imageKey = imageBytes ? `messages/${slug}/${crypto.randomUUID()}` : null;
    if (imageKey && imageBytes) await imageBucket()!.put(imageKey, imageBytes, {httpMetadata:{contentType:contentType!}});
    let message;
    try {
    [message] = await db
      .insert(messages)
      .values({ roomSlug: slug, displayName, body: messageBody, createdAt, imageKey })
      .returning();
    } catch (error) {
      if (imageKey) await imageBucket()!.delete(imageKey);
      throw error;
    }

    return Response.json({
      message: {
        id: message.id,
        roomSlug: message.roomSlug,
        displayName: message.displayName,
        body: message.body,
        imageUrl: messageImage(message),
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: routeError(error).includes("Upload too large") ? 413 : 500 });
  }
}
