import { env } from 'cloudflare:workers';
export const MAX_IMAGE = 10 * 1024 * 1024;
export function imageBucket() { return (env as unknown as { CHAT_IMAGES?: R2Bucket }).CHAT_IMAGES; }
export function messageImage(message: { id: number; roomSlug: string; imageKey: string | null }) {
  return message.imageKey ? `/api/rooms/${message.roomSlug}/images/${message.id}` : null;
}
export function imageType(bytes: Uint8Array) {
  const ascii = (a: number,b: number) => String.fromCharCode(...bytes.slice(a,b));
  if (bytes[0]===137 && ascii(1,4)==='PNG' && bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP') return 'image/webp';
  return null;
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Upload too large. Images must be 10 MB or smaller.');
  const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
  const chunks: Uint8Array[]=[];let length=0;
  while(true) {const {done,value}=await reader.read();if(done)break;length+=value.length;
    if(length>limit){await reader.cancel();throw new Error('Upload too large. Images must be 10 MB or smaller.');} chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
