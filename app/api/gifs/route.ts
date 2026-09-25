import { env } from 'cloudflare:workers';
import { gifUrl } from '../../gif-links';
export async function GET(request: Request) {
  const key = (env as unknown as {KLIPY_API_KEY?:string}).KLIPY_API_KEY;
  const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if (!key) return reply({error:'GIF search needs the KLIPY_API_KEY secret in Cloudflare.'},503);
  const input=new URL(request.url);
  const q=(input.searchParams.get('q')||'').trim().slice(0,100);
  const page=Math.min(20,Math.max(1,Number(input.searchParams.get('page'))||1));
  const url=new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${q?'search':'trending'}`);
  url.search=new URLSearchParams({q,page:String(page),per_page:'12',customer_id:'chat',content_filter:'high'}).toString();
  try {
    const r=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'manual'});
    if (!r.ok) return reply({error:r.status===429?'GIF search limit reached. Try again later.':'GIF provider unavailable. Check your KLIPY key and try again.'},502);
    const data=await r.json() as {result?:boolean;data?:{data?:Array<{id:string|number;title:string;file?:Record<string,{gif?:{url:string}}>}>;has_next?:boolean}};
    if (!data.result || !Array.isArray(data.data?.data)) return reply({error:'GIF provider returned an unexpected response.'},502);
    const items=data.data.data.map(item=>({id:String(item.id),title:item.title||'GIF',url:gifUrl(item.file?.md?.gif?.url||item.file?.hd?.gif?.url||''),preview:gifUrl(item.file?.sm?.gif?.url||item.file?.md?.gif?.url||'')})).filter(item=>item.url && item.preview);
    return reply({items,hasMore:data.data.has_next??items.length===12});
  } catch {return reply({error:'GIF search timed out. Please try again.'},502);}
}
