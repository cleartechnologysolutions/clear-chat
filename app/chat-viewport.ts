// Mobile browsers can pan the visual viewport independently when a keyboard opens.
// Track both its size and offset; never scroll the whole document to chase focus.
export function bindChatViewport(onResize: () => void) {
  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const originalViewport = meta?.content;
  if (meta) meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
  const viewport = window.visualViewport;
  let baseline = viewport?.height || window.innerHeight;
  let width = window.innerWidth;
  let frame = 0;
  const update = () => {
    frame = 0;
    const height = viewport?.height || window.innerHeight;
    const editing = !!document.activeElement?.matches('textarea, input:not([type="checkbox"]):not([type="file"])');
    if (window.innerWidth !== width) { width = window.innerWidth; baseline = window.innerHeight; }
    if (!editing) baseline = Math.max(baseline, height);
    root.style.setProperty('--chat-visible-height', `${height}px`);
    root.style.setProperty('--chat-visible-top', `${viewport?.offsetTop || 0}px`);
    root.dataset.chatKeyboard = String(editing && baseline - height > 100);
    onResize();
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  update();
  return () => {
    window.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    root.style.removeProperty('--chat-visible-height');
    root.style.removeProperty('--chat-visible-top');
    delete root.dataset.chatKeyboard;
    if (meta && originalViewport !== undefined) meta.content = originalViewport;
  };
}
