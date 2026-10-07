import {paletteColor} from '../app/message-groups';
const cache = new WeakMap<D1Database,Map<string,string>>();
export async function colorsFor(db:D1Database,names:string[]){
 let saved=cache.get(db);if(!saved){saved=new Map();cache.set(db,saved);}
 const keys=[...new Set(names.map(n=>n.trim().toLowerCase()))],colors=new Map<string,string>();
 async function read(list:string[]){for(let i=0;i<list.length;i+=80){const batch=list.slice(i,i+80);const rows=await db.prepare(`SELECT id,name FROM chat_author_colors WHERE name IN (${batch.map(()=>'?').join(',')})`).bind(...batch).all<{id:number;name:string}>();for(const row of rows.results)colors.set(row.name,paletteColor(row.id-1));}}
 for(const key of keys)if(saved.has(key))colors.set(key,saved.get(key)!);
 await read(keys.filter(key=>!colors.has(key)));
 const missing=keys.filter(k=>!colors.has(k));
 // Atomic insert prevents races; existing names never allocate another palette slot.
 for(let i=0;i<missing.length;i+=80)await db.batch(missing.slice(i,i+80).map(name=>db.prepare('INSERT INTO chat_author_colors(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM chat_author_colors WHERE name=?)').bind(name,name)));
 await read(missing);for(const [key,value] of colors)saved.set(key,value);return colors;
}
