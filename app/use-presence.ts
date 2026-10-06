'use client';
import {useEffect,useRef,useState} from 'react';
export function usePresence(room:string,name:string,onRemoved:()=>void) {
 const callback=useRef(onRemoved);callback.current=onRemoved;
 const [settled,setSettled]=useState(name);
 useEffect(()=>{const t=setTimeout(()=>setSettled(name.trim()||'Guest'),800);return()=>clearTimeout(t);},[name]);
 useEffect(()=>{
  if(!room||!settled)return;
  const id=crypto.randomUUID(),url=`/api/rooms/${room}/presence`;
  let alive=true,busy=false,joined=false;
  const payload=(action:string)=>JSON.stringify({id,name:settled,action});
  const beacon=()=>navigator.sendBeacon(url,new Blob([payload('leave')],{type:'application/json'}));
  async function sync(){
   if(busy||!alive)return;
   const visible=document.visibilityState==='visible';
   if(!visible&&!joined)return;
   busy=true;
   try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:payload(visible?(joined?'heartbeat':'join'):'leave'),keepalive:true,signal:AbortSignal.timeout(12000)});
    if(!alive){beacon();return;}
    if(r.status===404){alive=false;callback.current();return;}if(!r.ok)return;
    const d=await r.json() as {removed?:boolean;rejoin?:boolean};
    if(d.removed){alive=false;callback.current();return;}
    joined=visible&&!d.rejoin;
   }catch{}finally{
    busy=false;
    // Reconcile a tab switch that happened while the request was in flight.
    if(alive&&visible!==(document.visibilityState==='visible'))void sync();
   }
  }
  function hide(){beacon();joined=false;}
  function resume(){void sync();}
  void sync();const timer=setInterval(sync,20000);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',resume);
  return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',resume);beacon();};
 },[room,settled]);
}
