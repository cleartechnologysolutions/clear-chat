// Remote images load in the browser; never fetch arbitrary pasted URLs on the server.
export function gifUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (['giphy.com', 'www.giphy.com'].includes(u.hostname)) {
      const match = u.pathname.match(/^\/(?:gifs|embed)\/([a-zA-Z0-9-]+)\/?$/);
      const id = match?.[1].split('-').at(-1);
      return id && /^[a-zA-Z0-9]+$/.test(id) ? `https://media.giphy.com/media/${id}/giphy.gif` : null;
    }
    if (/\.(?:png|jpe?g|gif|webp|avif)$/i.test(u.pathname)) return u.href;
    if (/^media\d*\.giphy\.com$/.test(u.hostname) || ['static.klipy.com','static.klipy.co','static2.klipy.com'].includes(u.hostname)) {
      return /\.gif$/i.test(u.pathname) ? u.href : null;
    }
  } catch {}
  return null;
}
export function messageGifs(body: string) {
  return [...new Set((body.match(/https:\/\/[^\s<>]+/g) || []).map(gifUrl).filter((s): s is string => !!s))].slice(0, 4);
}
