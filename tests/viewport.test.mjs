import {bindChatViewport} from '../app/chat-viewport.ts';
import assert from 'node:assert/strict';
function events(obj={}){const handlers=new Map();return Object.assign(obj,{handlers,addEventListener(k,v){handlers.set(k,v)},removeEventListener(k){handlers.delete(k)},emit(k){handlers.get(k)?.()}})}
const props=new Map();const root={style:{setProperty(k,v){props.set(k,v)},removeProperty(k){props.delete(k)}},dataset:{}};
let focused=false,redraws=0,callback;
const vv=events({height:800,offsetTop:0});
const meta={content:"width=device-width, initial-scale=1"};
globalThis.document=events({querySelector:()=>meta,documentElement:root,activeElement:{matches:()=>focused}});
globalThis.window=events({innerHeight:800,innerWidth:390,visualViewport:vv,requestAnimationFrame(fn){callback=fn;return 1},cancelAnimationFrame(){callback=null}});
const flush=()=>{const fn=callback;callback=null;fn?.()};
const dispose=bindChatViewport(()=>redraws++);
assert.equal(props.get('--chat-visible-height'),'800px');assert.ok(meta.content.includes('interactive-widget=resizes-content'));
focused=true;vv.height=350;vv.offsetTop=140;document.emit('focusin');vv.emit('resize');flush();
assert.equal(props.get('--chat-visible-height'),'350px');assert.equal(props.get('--chat-visible-top'),'140px');assert.equal(root.dataset.chatKeyboard,'true');
vv.offsetTop=95;vv.emit('scroll');flush();assert.equal(props.get('--chat-visible-top'),'95px');
focused=false;vv.height=800;vv.offsetTop=0;document.emit('focusout');vv.emit('resize');flush();
assert.equal(root.dataset.chatKeyboard,'false');assert.equal(props.get('--chat-visible-height'),'800px');
assert.equal(redraws,4);dispose();assert.equal(props.size,0);assert.equal(meta.content,"width=device-width, initial-scale=1");assert.equal(vv.handlers.size,0);assert.equal(document.handlers.size,0);assert.equal(window.handlers.size,0);
console.log('PASS: keyboard resize, viewport panning, compact mode, closing keyboard and listener cleanup.');
