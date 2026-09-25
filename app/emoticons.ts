const EMOTICONS: Record<string, string> = {
  ':)': '🙂', ':-)': '🙂', ':D': '😃', ':-D': '😃', ':d': '😃', ':-d': '😃',
  ':P': '😛', ':-P': '😛', ':p': '😛', ':-p': '😛',
  ';)': '😉', ';-)': '😉', ':(': '🙁', ':-(': '🙁',
  ':O': '😮', ':-O': '😮', ':o': '😮', ':-o': '😮',
  ':/': '😕', ':-/': '😕', ':|': '😐', ':-|': '😐',
  ":'(": '😢', '>:(': '😠', '<3': '❤️', 'XD': '😆', 'xD': '😆',
};
// Convert only standalone tokens, never substrings of URLs, paths, or words.
export function convertEmoticons(text: string, onSend = false): string {
  return text.replace(/\S+/g, (token, offset: number) => {
    if (!onSend && offset + token.length === text.length) return token;
    return Object.prototype.hasOwnProperty.call(EMOTICONS, token) ? EMOTICONS[token] : token;
  });
}
