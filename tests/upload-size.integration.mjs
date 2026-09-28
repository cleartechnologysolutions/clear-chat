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
await fetch('/api/admin/messages',{method:'POST',headers:{Authorization:'Bearer local-test-only','Content-Type':'application/json'},body:JSON.stringify({roomSlug:'demo'})});
try {
 for(const size of [2*1024*1024,10*1024*1024]){
 const big=Buffer.alloc(size);png.copy(big);const response=await send('phone photo','demo',big);assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.ok(result.message.imageUrl);assert.equal((await (await fetch(result.message.imageUrl)).arrayBuffer()).byteLength,size);
 }
 const big=Buffer.alloc(10*1024*1024+1);png.copy(big);const rejected=await send('too large','demo',big);assert.equal(rejected.status,413);assert.match((await rejected.json()).error,/10 MB/);
 console.log('PASS: 2 MiB and 10 MiB image uploads round-trip intact; over-limit upload rejected with JSON.');
}finally{await mf.dispose();}
