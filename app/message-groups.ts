export type GroupableMessage = {
  id: number;
  displayName: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
};
// Order deliberately separates adjacent participants by hue, not just shade.
const COLORS = ['#3399ff','#ffdf00','#ff5555','#33dd77','#ee77ff','#ff9933','#33dddd','#ffffff'];
// Reserve each palette color once per visible conversation, in first-message order.
// Appending messages never changes colors already assigned in that conversation.
export function authorColors(messages: GroupableMessage[]) {
  const assigned = new Map<string, string>();
  const used = new Set<string>();
  for (const message of messages) {
    const name=message.displayName;
    if(assigned.has(name))continue;
    let color=COLORS[assigned.size] || '';
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
