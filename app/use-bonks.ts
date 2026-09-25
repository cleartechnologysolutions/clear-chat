'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export function useBonks(room:string,name:string,gong:()=>void) {
 const [notice,setNotice]=useState('');const [sending,setSending]=useState(false);
 const currentRoom=useRef(room);currentRoom.current=room;
 const clear=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const show=useCallback((message:string)=>{clearTimeout(clear.current);setNotice(message);clear.current=setTimeout(()=>setNotice(''),10000);},[]);
 useEffect(()=>()=>clearTimeout(clear.current),[]);
 useEffect(()=>{
   setNotice('');clearTimeout(clear.current);if(!room)return;
   let alive=true;let busy=false;let after:number|null=null;const abort=new AbortController();
   async function poll(){if(busy)return;busy=true;
    try{const r=await fetch(`/api/bonks/${room}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'poll',name:name.trim()||'Guest',after}),signal:abort.signal});
      if(!r.ok)return;const data=await r.json() as {cursor:number;events:{id:number;from:string}[]};
      if(!alive)return;after=data.cursor;
      if(data.events.length){gong();show(`🔔 ${data.events.at(-1)!.from} bonked you!`);}
    }catch{}finally{busy=false;}
   }
   void poll();const timer=setInterval(()=>void poll(),2500);
   return()=>{alive=false;abort.abort();clearInterval(timer);};
 },[room,name,gong,show]);
 async function bonk(target:string){if(sending||!room)return;setSending(true);
  try{const r=await fetch(`/api/bonks/${room}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',name:name.trim()||'Guest',target}),signal:AbortSignal.timeout(10000)});const d=await r.json() as {error?:string};if(currentRoom.current!==room)return;if(!r.ok)throw new Error(d.error||'Bonk failed.');show(`🔔 Bonk sent to ${target}.`);}
  catch(error){if(currentRoom.current===room)show(error instanceof Error?error.message:'Bonk failed.');}finally{setSending(false);}
 }
 return {notice,sending,bonk};
}
