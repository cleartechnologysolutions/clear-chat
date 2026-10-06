import {Miniflare} from 'miniflare';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/server',import.meta.url));
const mf=new Miniflare({name:'chat',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'test'},d1Databases:['DB'],r2Buckets:['CHAT_IMAGES'],durableObjects:{VIDEO_ROOMS:{className:'VideoRoom',useSQLite:true}},serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_slug TEXT NOT NULL, display_name TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, image_key TEXT)');
 await db.prepare('INSERT INTO messages(room_slug,display_name,body,created_at) VALUES(?,?,?,?)').bind('team','Historical','old message',Date.now()).run();
 const origin=(await mf.ready).origin;
 async function req(path,method='GET',body,admin=false){const r=await mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(admin?{Authorization:'Bearer test'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const presence=(id,name,action='join')=>req('/api/rooms/team/presence','POST',{id,name,action});
 const alice=crypto.randomUUID(),alice2=crypto.randomUUID(),bob=crypto.randomUUID();
 let r=await req('/api/rooms/team/messages');assert.equal(r.data.participants[0].name,'Historical');assert.equal(r.data.participants[0].online,false);
 assert.equal((await presence(alice,'Alice')).status,200);await presence(alice2,'Alice');await presence(bob,'Bob');
 r=await req('/api/rooms/team/messages');assert.equal(r.data.events.filter(e=>e.displayName==='Alice').length,1);assert.equal(r.data.participants.filter(p=>p.online).length,2);
 await presence(alice,'Alice','leave');r=await req('/api/rooms/team/messages');assert.equal(r.data.participants.find(p=>p.name==='Alice').online,true);assert.equal(r.data.events.filter(e=>e.displayName==='Alice').length,1);
 await presence(alice2,'Alice','leave');r=await req('/api/rooms/team/messages');assert.equal(r.data.participants.find(p=>p.name==='Alice').online,false);assert.equal(r.data.events.filter(e=>e.displayName==='Alice').length,2);
 await presence(alice,'Alice');await req('/api/rooms/team/messages','POST',{displayName:'Alice',body:'delete me'});await req('/api/rooms/team/messages','POST',{displayName:'Bob',body:'keep me'});
 const form=new FormData();form.set('displayName','Alice');form.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
 const imageReq=new Request(origin+'/api/rooms/team/messages',{method:'POST',body:form,headers:{Origin:origin}});
 const imageResponse=await mf.dispatchFetch(imageReq.url,{method:'POST',headers:Object.fromEntries(imageReq.headers),body:await imageReq.arrayBuffer()});assert.equal(imageResponse.status,200);
 const bucket=await mf.getR2Bucket('CHAT_IMAGES');assert.equal((await bucket.list()).objects.length,1);
 assert.equal((await req('/api/admin/messages','DELETE',{action:'remove-participant',roomSlug:'team',name:'Alice'})).status,401);
 assert.equal((await req('/api/admin/messages','DELETE',{action:'remove-participant',roomSlug:'team',name:'Alice'},true)).status,200);
 assert.equal((await bucket.list()).objects.length,0);
 assert.equal((await presence(alice,'Alice','heartbeat')).data.removed,true);
 r=await req('/api/rooms/team/messages?after=999999');assert.ok(!r.data.messages.some(m=>m.displayName==='Alice'));assert.ok(!r.data.events.some(e=>e.displayName==='Alice'));assert.ok(!r.data.participants.some(p=>p.name==='Alice'));assert.ok(r.data.messages.some(m=>m.displayName==='Bob'));
 assert.equal((await presence(crypto.randomUUID(),'Alice')).status,200);r=await req('/api/rooms/team/messages');assert.ok(r.data.participants.some(p=>p.name==='Alice'&&p.online));assert.equal(r.data.events.filter(e=>e.displayName==='Alice').length,1);
 await db.prepare('UPDATE chat_sessions SET seen=? WHERE room=? AND name=?').bind(Date.now()-200000,'team','Bob').run();
 await presence(crypto.randomUUID(),'Carol');r=await req('/api/rooms/team/messages');assert.ok(r.data.events.some(e=>e.displayName==='Bob'&&e.body.includes('left')));
 const storedColor=r.data.messages.find(m=>m.displayName==='Bob').authorColor;assert.match(storedColor,/^#[0-9a-f]{6}$/i);await req('/api/rooms/team/messages','POST',{displayName:'Different',body:'new author'});const recolored=await req('/api/rooms/team/messages');assert.equal(recolored.data.messages.find(m=>m.displayName==='Bob').authorColor,storedColor);r=recolored;
 const count=r.data.events.length;await presence(bob,'Bob','heartbeat');r=await req('/api/rooms/team/messages');assert.equal(r.data.events.length,count);
 const admin=await req('/api/admin/messages','GET',null,true);assert.ok(admin.data.rooms[0].participants.some(p=>p.name==='Carol'&&p.online));
 console.log('PASS: historical import, shared-name/multi-tab presence, join/leave notices, unauthorized removal, targeted deletion, full refreshed history, revoked heartbeat, free rejoin, timeout deduplication, admin list');
}finally{await mf.dispose();}
