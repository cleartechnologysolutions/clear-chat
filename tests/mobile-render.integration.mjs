import {Miniflare} from 'miniflare';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/server',import.meta.url));
const mf=new Miniflare({name:'chat',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'test-password'},d1Databases:['DB'],r2Buckets:['CHAT_IMAGES'],durableObjects:{VIDEO_ROOMS:{className:'VideoRoom',useSQLite:true}},serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const origin=(await mf.ready).origin;
 const response=await mf.dispatchFetch(origin+'/mobile');
 assert.equal(response.status,200);
 const html=await response.text();
 assert.ok(html.includes('Build 23'));
 assert.ok(html.includes('chat-conversation'));
 assert.ok(html.includes('composer-input'));
 assert.ok(html.includes('name="viewport"'));
 console.log('PASS: production room renders mobile layout, viewport metadata and Build 23.');
}finally{await mf.dispose();}
