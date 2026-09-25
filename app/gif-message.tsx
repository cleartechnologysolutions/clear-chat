 'use client';
import { useState } from 'react';
import { gifUrl } from './gif-links';
function LinkedImage({url,source,onLoad}:{url:string;source:string;onLoad?:()=>void}) {
 const [failed,setFailed]=useState(false);
 return <div className="my-2"><a href={source} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline">{failed?source:<img src={url} alt="Shared image" referrerPolicy="no-referrer" onLoad={onLoad} onError={()=>setFailed(true)} className="max-h-64 max-w-full rounded-lg object-contain"/>}</a>{url.includes('.klipy.')&&<span className="block text-xs text-slate-400">Powered by KLIPY</span>}</div>;
}
export function GifMessage({body,onLoad,previewOnly=false}:{body:string;onLoad?:()=>void;previewOnly?:boolean}) {
 let count=0;
 return <div className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-100">{body.split(/(https:\/\/[^\s<>]+)/g).map((part,index)=>{
 const url=gifUrl(part);if(url&&count++<4)return <LinkedImage key={part+index} url={url} source={part} onLoad={onLoad}/>;
 return previewOnly?null:<span key={index}>{part}</span>;
 })}</div>;
}
