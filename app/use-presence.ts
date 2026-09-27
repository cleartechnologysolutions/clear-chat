'use client';
import {useEffect,useRef,useState} from 'react';
export function usePresence(room:string,name:string,onRemoved:()=>void) {
 const callback=useRef(onRemoved);callback.current=onRemoved;
 const [settled,setSettled]=useState(name);
 useEffect(()=>{const t=setTimeout(()=>setSettled(name.trim()||'Guest'),800);return()=>clearTimeout(t);},[name]);
 useEffect(()=>{
  if(!room||!settled)return;
  const id=crypto.randomUUID();const url=`/api/rooms/${room}/presence`;let alive=true;let busy=false;let joined=false;
  const payload=(action:string)=>JSON.stringify({id,name:settled,action});
  async function beat(){if(busy||!alive)return;busy=true;
   try {const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:payload(joined?'heartbeat':'join')});
    if(!alive){navigator.sendBeacon(url,new Blob([payload('leave')],{type:'application/json'}));return;}if(r.status===404){callback.current();return;}if(!r.ok)return;
    const d=await r.json() as {removed?:boolean;rejoin?:boolean};if(d.removed){alive=false;callback.current();return;}
    joined=!d.rejoin;
   }catch{}finally{busy=false;}
  }
  function leave(){if(joined)navigator.sendBeacon(url,new Blob([payload('leave')],{type:'application/json'}));joined=false;}
  function resume(){void beat();}
  void beat();const timer=setInterval(beat,20000);
  window.addEventListener('pagehide',leave);window.addEventListener('pageshow',resume);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',resume);leave();};
 },[room,settled]);
}
