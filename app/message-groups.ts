export type GroupableMessage = {
  kind?: string;
  authorColor?: string;
  id: number;
  displayName: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
};
// Order deliberately separates adjacent participants by hue, not just shade.
const COLORS = ['#3399ff','#ffdf00','#ff5555','#33dd77','#ee77ff','#ff9933','#33dddd','#ffffff'];
export function paletteColor(index:number){
 if(index<COLORS.length)return COLORS[index];
 const hue=(index*137.508)%360,chroma=.42,light=.72,x=chroma*(1-Math.abs((hue/60)%2-1));
 const channels=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
 return '#'+channels.map(v=>Math.round((v+light-chroma/2)*255).toString(16).padStart(2,'0')).join('');
}
export function authorColors(messages:GroupableMessage[]){
 const assigned=new Map<string,string>();
 for(const m of messages){if(m.kind==='system')continue;
 let hash=0;for(const c of m.displayName.trim().toLowerCase())hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 assigned.set(m.displayName,m.authorColor||paletteColor(hash%COLORS.length));
 }return assigned;
}
export function groupMessages<T extends GroupableMessage>(messages: T[]) {
  const groups: {displayName:string; messages:T[]}[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (previous && previous.messages[0].kind !== 'system' && message.kind !== 'system' && previous.displayName === message.displayName) previous.messages.push(message);
    else groups.push({displayName:message.displayName,messages:[message]});
  }
  return groups;
}
