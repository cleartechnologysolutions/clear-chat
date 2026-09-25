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
export function groupMessages<T extends GroupableMessage>(messages: T[]) {
  const groups: {displayName:string; messages:T[]}[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (previous?.displayName === message.displayName) previous.messages.push(message);
    else groups.push({displayName:message.displayName,messages:[message]});
  }
  return groups;
}
