'use client';
import { useEffect,useState } from 'react';
type Gif={id:string;title:string;url:string;preview:string};
export function GifPicker({onSelect}:{onSelect:(url:string)=>void}) {
 const [query,setQuery]=useState('');const [search,setSearch]=useState('');const [page,setPage]=useState(1);
 const [items,setItems]=useState<Gif[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [more,setMore]=useState(false);
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');setItems([]);
 fetch(`/api/gifs?q=${encodeURIComponent(search)}&page=${page}`,{signal:abort.signal}).then(async r=>{const d=await r.json() as {error?:string;items:Gif[];hasMore:boolean};if(!r.ok)throw new Error(d.error||'GIF search failed.');if(!abort.signal.aborted){setItems(d.items);setMore(d.hasMore);}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[search,page]);
 function run(){setPage(1);setSearch(query.trim());}
 return <div><div className="flex gap-2"><input aria-label="Search KLIPY" placeholder="Search KLIPY" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();run();}}} className="min-w-0 flex-1 rounded bg-white/10 p-2"/><button type="button" onClick={run} className="rounded bg-cyan-800 px-2">Search</button></div>
 <div aria-live="polite" className="py-2 text-sm">{busy?'Finding GIFs…':error||(!items.length?'No GIFs found. Try another search.':'')}</div>
 <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto">{items.map(g=><button type="button" key={g.id} title={g.title} aria-label={`Select ${g.title}`} onClick={()=>onSelect(g.url)}><img loading="lazy" src={g.preview} alt={g.title} className="h-24 w-full rounded object-contain"/></button>)}</div>
 <div className="mt-2 flex items-center justify-between text-xs"><a href="https://klipy.com" target="_blank" rel="noopener noreferrer">Powered by KLIPY</a><button type="button" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><button type="button" disabled={busy||!more} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>;
}
