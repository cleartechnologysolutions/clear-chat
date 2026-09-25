type Bonk = {id:number;from:string;to:string;source:string};
type BonkState = {sequence:number;events:Bonk[]};
export async function handleBonks(state:DurableObjectState,request:Request) {
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  let data:Record<string,unknown>;
  try {
    const reader=request.body?.getReader();if(!reader)return reply({error:'Missing request'},400);
    let text='';let bytes=0;const decoder=new TextDecoder();
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2048){await reader.cancel();return reply({error:'Request too large'},413);}text+=decoder.decode(part.value,{stream:true});}
    const parsed=JSON.parse(text+decoder.decode());if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();data=parsed;
  }catch{return reply({error:'Invalid request'},400);}
  const name=typeof data.name==='string'?data.name.trim().slice(0,32):'';
  if(!name)return reply({error:'Enter your name first.'},400);
  // Retain only a one-way digest, not the sender's network address.
  const source=data.action==='send'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('CF-Connecting-IP')||'local')))).map(b=>b.toString(16).padStart(2,'0')).join(''):'';
  return state.blockConcurrencyWhile(async()=>{
    const saved=await state.storage.get<BonkState>('bonks')||{sequence:0,events:[]};
    const now=Date.now();saved.events=saved.events.filter(e=>now-e.id<90_000);
    if(data.action==='poll') {
      const after=typeof data.after==='number'&&Number.isFinite(data.after)?data.after:null;
      return reply({cursor:saved.sequence,events:after===null?[]:saved.events.filter(e=>e.id>after&&e.to===name).map(({id,from,to})=>({id,from,to}))});
    }
    if(data.action!=='send')return reply({error:'Invalid action'},400);
    const target=typeof data.target==='string'?data.target.trim().slice(0,32):'';
    if(!target||target===name)return reply({error:'Choose someone else to bonk.'},400);
    if(saved.events.some(e=>(e.to===target&&now-e.id<20_000)||(e.source===source&&now-e.id<10_000)))return reply({error:'Give them a moment! Wait a few seconds before another bonk.'},429);
    const id=Math.max(now,saved.sequence+1);saved.sequence=id;saved.events.push({id,from:name,to:target,source});saved.events=saved.events.slice(-64);
    await state.storage.put('bonks',saved);
    await state.storage.setAlarm(now+120_000);
    return reply({ok:true});
  });
}
