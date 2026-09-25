'use client';
import { useEffect, useState } from 'react';
import { GifMessage } from './gif-message';
import { MessageImage } from './message-image';
import { authorColors, groupMessages, type GroupableMessage } from './message-groups';
export function MessageBlocks({messages,onImageLoad,onBonk,viewerName,bonkBusy=false}:{messages:GroupableMessage[];onImageLoad?:()=>void;onBonk?:(name:string)=>void;viewerName?:string;bonkBusy?:boolean}) {
  const [menu,setMenu]=useState<number|null>(null);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};
    const outside=(e:PointerEvent)=>{if(!(e.target instanceof Element)||!e.target.closest('[data-author-menu]'))setMenu(null);};
    document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
  },[]);
  const colors=authorColors(messages);
  return <>{groupMessages(messages).map(group=>{
    const color=colors.get(group.displayName)!;
    return <article key={group.messages[0].id} aria-label={`Messages from ${group.displayName}`} className="rounded-lg border border-white/10 border-l-[5px] p-3" style={{borderLeftColor:color,backgroundColor:color+'12'}}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{color,backgroundColor:color+'20'}}>{Array.from(group.displayName.trim()).slice(0,2).join('').toUpperCase()||'?' }</span>
        {onBonk&&group.displayName!==viewerName?<div data-author-menu className="relative min-w-0">
          <button type="button" aria-label={`Actions for ${group.displayName}`} aria-expanded={menu===group.messages[0].id} onClick={()=>setMenu(current=>current===group.messages[0].id?null:group.messages[0].id)} className="break-words text-left font-bold underline decoration-dotted underline-offset-4" style={{color}}>{group.displayName}</button>
          {menu===group.messages[0].id&&<div className="absolute left-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-white/20 bg-slate-950 p-2 shadow-xl">
            <button type="button" disabled={bonkBusy} onClick={()=>{setMenu(null);onBonk(group.displayName);}} className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:opacity-50">🔔 Bonk {group.displayName}</button>
          </div>}
        </div>:<p className="min-w-0 break-words font-bold" style={{color}}>{group.displayName}</p>}
        <time dateTime={group.messages[0].createdAt} suppressHydrationWarning className="ml-auto text-[11px] text-slate-400">{new Date(group.messages[0].createdAt).toLocaleString()}</time>
      </div>
      <div className="divide-y divide-white/5">{group.messages.map(message=><div key={message.id} data-message-id={message.id} title={new Date(message.createdAt).toLocaleString()} className="py-1">
        <GifMessage body={message.body} onLoad={onImageLoad}/>
        {message.imageUrl&&<MessageImage src={message.imageUrl} onLoad={onImageLoad}/>}
        <time dateTime={message.createdAt} suppressHydrationWarning className="sr-only">{new Date(message.createdAt).toLocaleString()}</time>
      </div>)}</div>
    </article>;
  })}</>;
}
