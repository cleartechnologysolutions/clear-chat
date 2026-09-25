export type GroupableMessage = {
  id: number;
  displayName: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
};
const COLORS = ['#67e8f9','#c4b5fd','#fda4af','#86efac','#fcd34d','#93c5fd','#fdba74','#f0abfc','#5eead4','#bef264','#a5b4fc','#f9a8d4'];
export function authorColor(name: string) {
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return COLORS[(hash >>> 0) % COLORS.length];
}
// Reserve each palette color once per visible conversation, in first-message order.
// Appending messages never changes colors already assigned in that conversation.
export function authorColors(messages: GroupableMessage[]) {
  const assigned = new Map<string, string>();
  const used = new Set<string>();
  const alternatives = [4,3,2,0,1,6,8,5,7,9,10,11].map(index=>COLORS[index]);
  for (const message of messages) {
    const name=message.displayName;
    if(assigned.has(name))continue;
    let color=authorColor(name);
    if(used.has(color)) color=alternatives.find(candidate=>!used.has(candidate)) || '';
    if(!color) {
      // Beyond the base palette, generate additional distinct light colors.
      let index=assigned.size;
      do {
        const hue=(index++ * 137.508)%360;
        const chroma=0.42, light=0.72, x=chroma*(1-Math.abs((hue/60)%2-1));
        const channels=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
        color='#'+channels.map(v=>Math.round((v+light-chroma/2)*255).toString(16).padStart(2,'0')).join('');
      } while(used.has(color));
    }
    assigned.set(name,color);used.add(color);
  }
  return assigned;
}
export function groupMessages<T extends GroupableMessage>(messages: T[]) {
  const groups: {displayName:string; messages:T[]}[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (previous?.displayName === message.displayName) previous.messages.push(message);
    else groups.push({displayName:message.displayName,messages:[message]});
  }
  return groups;
}
