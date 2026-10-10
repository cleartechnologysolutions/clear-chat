import {ensureRooms,roomExists} from './rooms';
import {colorsFor} from './author-colors';
import {presenceList} from './presence';
// One instance per room, shared across visitors and Worker locations. Never browser-cache chat.
export class RoomCache {
 private value: unknown;
 private expires=0;
 private retryAt=0;
 constructor(private db:D1Database){}
 async fetch(request:Request):Promise<Response>{
  if(request.method==='DELETE'){this.value=undefined;this.expires=0;this.retryAt=0;return new Response('OK');}
  const room=new URL(request.url).searchParams.get('room')||'';
  if(!/^[a-z0-9-]{1,60}$/.test(room))return new Response('Invalid room',{status:400});
  const headers={'Cache-Control':'no-store'};
  if(this.value && Date.now()<this.expires)return Response.json(this.value,{headers});
  if(Date.now()<this.retryAt)return Response.json({error:'Chat storage is temporarily unavailable. Retrying in one minute.'},{status:503,headers:{...headers,'Retry-After':'60'}});
  try{
   await ensureRooms(this.db);
   if(!await roomExists(this.db,room))return Response.json({error:'Room unavailable. Ask the admin for an existing room link.'},{status:404,headers});
   const rows=await this.db.prepare('SELECT * FROM messages WHERE room_slug=? ORDER BY id DESC LIMIT 100').bind(room).all<{id:number;room_slug:string;display_name:string;body:string;image_key:string|null;created_at:number}>();
   const participants=await presenceList(this.db,room);
   const colors=await colorsFor(this.db,[...rows.results.slice().reverse().map(m=>m.display_name),...participants.map(p=>p.name)]);
   this.value={room,participants:participants.map(p=>({...p,authorColor:colors.get(p.name.trim().toLowerCase())})),events:[],messages:rows.results.reverse().map(m=>({id:m.id,roomSlug:room,displayName:m.display_name,authorColor:colors.get(m.display_name.trim().toLowerCase()),body:m.body,imageUrl:m.image_key?`/api/rooms/${room}/images/${m.id}`:null,createdAt:new Date(m.created_at).toISOString()}))};
   this.expires=Date.now()+30000;return Response.json(this.value,{headers});
  }catch(error){
   console.error('Room cache refresh failed',error);this.retryAt=Date.now()+60000;
   return Response.json({error:'Chat storage is temporarily unavailable. Retrying in one minute.'},{status:503,headers:{...headers,'Retry-After':'60'}});
  }
 }
}
export async function invalidateRoom(namespace:DurableObjectNamespace,room:string){
 const r=await namespace.get(namespace.idFromName('cache:'+room)).fetch('https://internal/internal/cache',{method:'DELETE'});
 if(!r.ok)throw new Error('Room cache invalidation failed');
}
