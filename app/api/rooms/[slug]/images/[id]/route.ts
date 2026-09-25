import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../../../../db';
import { messages } from '../../../../../../db/schema';
import { imageBucket } from '../../../../../chat-images';
export async function GET(_request: Request, context: {params:Promise<{slug:string;id:string}>}) {
  const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  try {
    const {slug,id}=await context.params;
    if(!/^[a-z0-9-]{1,60}$/.test(slug)||!/^\d+$/.test(id))return new Response(null,{status:404,headers});
    const [message]=await getDb().select().from(messages).where(and(eq(messages.id,Number(id)),eq(messages.roomSlug,slug))).limit(1);
    if(!message?.imageKey)return new Response(null,{status:404,headers});
    const bucket=imageBucket();if(!bucket)return new Response('Image storage unavailable',{status:503,headers});
    const image=await bucket.get(message.imageKey);if(!image)return new Response(null,{status:404,headers});
    return new Response(image.body,{headers:{...headers,'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  } catch {return new Response('Could not load image',{status:503,headers});}
}
