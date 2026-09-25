import {Miniflare} from 'miniflare';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/server',import.meta.url));
const mf=new Miniflare({name:'chat',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,durableObjects:{VIDEO_ROOMS:{className:'VideoRoom',useSQLite:true}},serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
const sockets=[];
async function join(room='test'){
 const r=await mf.dispatchFetch(`http://chat.test/api/calls/${room}`,{headers:{Upgrade:'websocket',Origin:'http://chat.test'}});assert.equal(r.status,101);
 const ws=r.webSocket;const queue=[];const waits=[];ws.addEventListener('message',e=>{const data=JSON.parse(e.data);const waiter=waits.shift();if(waiter)waiter(data);else queue.push(data);});ws.accept();sockets.push(ws);
 return {ws,next:()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>waits.push(resolve)),send:d=>ws.send(JSON.stringify(d))};
}
try {
 const forbidden=await mf.dispatchFetch('http://chat.test/api/calls/test',{headers:{Upgrade:'websocket',Origin:'https://elsewhere.test'}});assert.equal(forbidden.status,403);
 const a=await join();const first=await a.next();assert.equal(first.type,'joined');
 const ice=await mf.dispatchFetch('http://chat.test/api/calls/test/ice',{method:'POST',headers:{Origin:'http://chat.test',Authorization:`Bearer ${first.token}`}});assert.equal(ice.status,200);assert.equal((await ice.json()).relay,false);
 const invalid=await mf.dispatchFetch('http://chat.test/api/calls/test/ice',{method:'POST',headers:{Origin:'http://chat.test',Authorization:'Bearer bogus'}});assert.equal(invalid.status,403);
 const crossRoom=await mf.dispatchFetch('http://chat.test/api/calls/other/ice',{method:'POST',headers:{Origin:'http://chat.test',Authorization:`Bearer ${first.token}`}});assert.equal(crossRoom.status,403);
 a.send({type:'ready'});assert.equal((await a.next()).type,'waiting');const b=await join();assert.equal((await b.next()).type,'joined');b.send({type:'ready'});const offer=await a.next();const answer=await b.next();assert.equal(offer.offerer,true);assert.equal(answer.offerer,false);assert.equal(offer.callId,answer.callId);
 a.send({type:'description',callId:offer.callId,description:{type:'offer',sdp:'test'}});assert.equal((await b.next()).description.sdp,'test');
 const c=await join();assert.equal((await c.next()).type,'full');
 a.send({type:'leave'});assert.equal((await b.next()).type,'peer-left');const d=await join();assert.equal((await d.next()).type,'joined');
 d.send({type:'ready'});const second=await b.next();assert.equal(second.type,'start');assert.notEqual(second.callId,offer.callId);await d.next();
 b.send({type:'candidate',callId:offer.callId,candidate:{candidate:'stale'}});b.send({type:'candidate',callId:second.callId,candidate:{candidate:'current'}});assert.equal((await d.next()).candidate.candidate,'current');
 console.log('PASS: same-origin enforcement, session-bound ICE, isolated rooms, two seats, forwarding, seat release, stale signal rejection');
}finally{for(const s of sockets){try{s.send(JSON.stringify({type:'leave'}));s.close();}catch{}}await mf.dispose();}
