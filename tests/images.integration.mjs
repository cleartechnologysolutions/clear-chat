import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
const mf=new Miniflare({name:'chat',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'local-test-only'},d1Databases:['DB'],r2Buckets:['CHAT_IMAGES'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE messages (id integer PRIMARY KEY AUTOINCREMENT, room_slug text NOT NULL, display_name text NOT NULL, body text NOT NULL, created_at integer NOT NULL)");
await db.exec('ALTER TABLE messages ADD COLUMN image_key text');
const bucket=await mf.getR2Bucket('CHAT_IMAGES');
const fetch=async(path,options)=>{const request=new Request('http://chat.test'+path,options);return mf.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:request.body?await request.arrayBuffer():undefined});};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII=','base64');
async function send(body='',room='demo',bytes=png){const form=new FormData();form.set('displayName','Test');form.set('body',body);form.set('image',new Blob([bytes],{type:'image/png'}),'test.png');return fetch(`/api/rooms/${room}/messages`,{method:'POST',body:form});}
async function admin(action,roomSlug){return fetch('/api/admin/messages',{method:'DELETE',headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},body:JSON.stringify({action,roomSlug})});}
let response=await send('caption');assert.equal(response.status,200,await response.clone().text());
const message=(await response.json()).message;assert.ok(message.imageUrl);assert.equal(message.body,'caption');
assert.deepEqual(Buffer.from(await (await fetch(message.imageUrl)).arrayBuffer()),png);
assert.equal((await fetch(message.imageUrl.replace('/demo/','/other/'))).status,404);
response=await send();assert.equal(response.status,200);assert.equal((await response.json()).message.body,'');
response=await fetch('/api/rooms/demo/messages',{method:'POST',body:JSON.stringify({body:'Plain text'})});assert.equal(response.status,200);assert.equal((await response.json()).message.imageUrl,null);
assert.equal((await send('bad','demo',Buffer.from('<svg></svg>'))).status,415);
assert.equal((await send('large','demo',Buffer.alloc(10*1024*1024+1))).status,413);
assert.equal((await bucket.list()).objects.length,2);
response=await fetch('/api/rooms/demo/messages');assert.equal((await response.json()).messages.length,3);
const other=(await (await send('keep','other')).json()).message;
response=await admin('delete-room','demo');assert.equal(response.status,200);assert.equal((await fetch(message.imageUrl)).status,404);assert.equal((await bucket.list()).objects.length,1);
assert.equal((await fetch(other.imageUrl)).status,200);
await db.prepare('UPDATE messages SET created_at=? WHERE id=?').bind(Date.now()-31*86400000,other.id).run();
response=await admin('cleanup-old');assert.equal(response.status,200);assert.equal((await bucket.list()).objects.length,0);
console.log('PASS: captions, image-only, text-only, original bytes, invalid types/size, room scoping, room deletion, 30-day cleanup');
await mf.dispose();
