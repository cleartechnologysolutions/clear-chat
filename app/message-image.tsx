'use client';
import { useEffect, useRef, useState } from 'react';
export function MessageImage({src, onLoad}:{src:string;onLoad?:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  if(failed)return <p className="mt-2 text-sm text-slate-400">Image unavailable or removed.</p>;
  return <>
    <button type="button" aria-label="Enlarge attached image" className="mt-3 block max-w-full" onClick={()=>dialog.current?.showModal()}>
      <img src={src} alt="Chat attachment" onLoad={onLoad} onError={()=>setFailed(true)} className="max-h-64 max-w-full rounded-lg object-contain" />
    </button>
    <dialog ref={dialog} className="m-auto max-h-[95dvh] max-w-[95vw] rounded-lg border border-white/20 bg-slate-950 p-4 text-white backdrop:bg-black/85" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
      <button type="button" onClick={()=>dialog.current?.close()} className="mb-3 rounded border border-white/30 px-4 py-2">Close image</button>
      <img src={src} alt="Full size chat attachment" className="max-h-[80dvh] max-w-full object-contain" />
    </dialog>
  </>;
}
