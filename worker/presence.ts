// Allow background timer throttling; explicit tab close still leaves immediately.
const ONLINE_MS = 180_000;
export async function presenceList(db:D1Database, room:string) {
  const rows=await db.prepare('SELECT name, last_seen FROM chat_participants WHERE room = ? ORDER BY name COLLATE NOCASE').bind(room).all<{name:string;last_seen:number}>();
  return rows.results.map(p=>({name:p.name,online:p.last_seen>Date.now()-ONLINE_MS,lastSeen:p.last_seen}));
}
export async function expirePresence(db:D1Database, room:string) {
  const stale=await db.prepare('SELECT DISTINCT name FROM chat_sessions WHERE room=? AND removed=0 AND seen<=?').bind(room,Date.now()-ONLINE_MS).all<{name:string}>();
  await db.prepare('DELETE FROM chat_sessions WHERE room=? AND seen<=? AND removed=0').bind(room,Date.now()-ONLINE_MS).run();
  for(const {name} of stale.results) {
    const live=await db.prepare('SELECT id FROM chat_sessions WHERE room=? AND name=? AND removed=0 AND seen>? LIMIT 1').bind(room,name,Date.now()-ONLINE_MS).first();
    if(!live) await event(db,room,name,'left');
  }
  await db.prepare('DELETE FROM chat_sessions WHERE room=? AND removed=1 AND seen<?').bind(room,Date.now()-86400000).run();
}
async function event(db:D1Database,room:string,name:string,kind:string) {
  await db.prepare('INSERT INTO chat_events(room,name,kind,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM chat_rooms WHERE slug=? AND active=1)').bind(room,name,kind,Date.now(),room).run();
}
export async function handlePresence(state:DurableObjectState,db:D1Database,request:Request) {
 return state.blockConcurrencyWhile(async()=>{
  const url=new URL(request.url);const room=url.searchParams.get('room') || url.pathname.split('/')[3];
  if(!room)return new Response('Room required',{status:400});
  if(!await db.prepare('SELECT slug FROM chat_rooms WHERE slug=? AND active=1').bind(room).first())return new Response('Room unavailable',{status:404});
  await expirePresence(db,room);
  if(url.pathname==='/internal/remove-participant') {
    const {name}=await request.json() as {name:string};
    await db.prepare('UPDATE chat_sessions SET removed=1 WHERE room=? AND name=?').bind(room,name).run();
    await db.prepare('UPDATE chat_participants SET last_seen=0 WHERE room=? AND name=?').bind(room,name).run();
    return Response.json({ok:true});
  }
  if(request.method==='GET')return Response.json({participants:await presenceList(db,room)});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const raw=await request.text();if(raw.length>2048)return new Response('Too large',{status:413});
  let body;try{body=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
  const {id,action}=body;const name=typeof body.name==='string'?body.name.trim().slice(0,32):'';
  if(!name||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||!['join','heartbeat','leave'].includes(action))return new Response('Invalid presence',{status:400});
  const existing=await db.prepare('SELECT name, removed FROM chat_sessions WHERE room=? AND id=?').bind(room,id).first<{name:string;removed:number}>();
  if(existing?.removed || (existing && existing.name!==name))return Response.json({removed:true});
  if(action==='leave') {
    await db.prepare('DELETE FROM chat_sessions WHERE room=? AND id=?').bind(room,id).run();
    const other=await db.prepare('SELECT id FROM chat_sessions WHERE room=? AND name=? AND removed=0 LIMIT 1').bind(room,name).first();
    if(existing&&!other){await db.prepare('UPDATE chat_participants SET last_seen=0 WHERE room=? AND name=?').bind(room,name).run();await event(db,room,name,'left');}
  } else {
    // Heartbeats never resurrect sessions removed by admin or expired while asleep.
    if(!existing&&action!=='join')return Response.json({rejoin:true});
    const online=await db.prepare('SELECT id FROM chat_sessions WHERE room=? AND name=? AND removed=0 LIMIT 1').bind(room,name).first();
    await db.batch([
      db.prepare('INSERT INTO chat_sessions(room,id,name,seen) VALUES(?,?,?,?) ON CONFLICT(room,id) DO UPDATE SET seen=excluded.seen').bind(room,id,name,Date.now()),
      db.prepare('INSERT INTO chat_participants(room,name,last_seen) VALUES(?,?,?) ON CONFLICT(room,name) DO UPDATE SET last_seen=excluded.last_seen').bind(room,name,Date.now())
    ]);
    if(!online)await event(db,room,name,'joined');
  }
  await state.storage.put('presenceRoom',room);await state.storage.setAlarm(Date.now()+ONLINE_MS);
  return Response.json({participants:await presenceList(db,room)});
 });
}
