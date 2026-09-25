'use client';
import { GifMessage } from './gif-message';
import { MessageImage } from './message-image';
import { authorColors, groupMessages, type GroupableMessage } from './message-groups';
export function MessageBlocks({messages,onImageLoad}:{messages:GroupableMessage[];onImageLoad?:()=>void}) {
  const colors=authorColors(messages);
  return <>{groupMessages(messages).map(group=>{
    const color=colors.get(group.displayName)!;
    return <article key={group.messages[0].id} aria-label={`Messages from ${group.displayName}`} className="rounded-lg border border-white/10 border-l-[5px] p-3" style={{borderLeftColor:color,backgroundColor:color+'12'}}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{color,backgroundColor:color+'20'}}>{Array.from(group.displayName.trim()).slice(0,2).join('').toUpperCase()||'?' }</span>
        <p className="min-w-0 break-words font-bold" style={{color}}>{group.displayName}</p>
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
