"use client";

import { bindChatViewport } from "./chat-viewport";
import { usePresence } from "./use-presence";
import { useBonks } from "./use-bonks";
import { useMessageSound } from "./message-sound";
import { VideoCall } from "./video-call";
import { convertEmoticons } from "./emoticons";
import { GifPicker } from "./gif-picker";
import { GifMessage } from "./gif-message";
import { MessageBlocks } from "./message-blocks";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

type Participant = {name:string;authorColor?:string;online:boolean;lastSeen:number};
type ChatMessage = {
  kind?:string;
  authorColor?:string;
  id: number;
  roomSlug: string;
  displayName: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
};

type MessagesResponse = {
  participants?:Participant[];
  events?:ChatMessage[];
  messages?: ChatMessage[];
  message?: ChatMessage;
  error?: string;
};

const EMOJIS = [
  "😀",
  "😂",
  "👍",
  "👎",
  "❤️",
  "🔥",
  "✅",
  "❌",
  "👀",
  "😭",
  "🤦",
  "🤷",
  "🎉",
  "🙏",
  "💯",
  "😬",
  "😎",
  "🤔",
  "🙄",
  "😡",
  "😠",
  "😤",
  "😒",
  "😑",
  "😐",
  "🚀",
];

export function ChatRoom({ initialSlug }: { initialSlug?: string }) {
  const [showRoomDetails, setShowRoomDetails] = useState(!initialSlug);
  const [slug, setSlug] = useState(initialSlug || "");
  const [loadedSlug, setLoadedSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  useEffect(() => bindChatViewport(() => {
    if (followBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }), []);
  const sound = useMessageSound();
  const attention = useBonks(loadedSlug,displayName,sound.gong);
  const notifyRef = useRef(true);
  const sendingRef = useRef(false);
  const seenIds = useRef(new Set<number>());
  const fetchedId = useRef(0);
  const polling = useRef(false);
  const activeRead = useRef<AbortController | null>(null);
  const roomRequest = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  useLayoutEffect(() => {
    const input = composerRef.current;
    if (!input || !window.matchMedia('(max-width:1023px)').matches) return;
    input.style.height = '44px';
    input.style.height = `${Math.min(88, Math.max(44, input.scrollHeight))}px`;
  }, [draft]);

  const pendingCursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCursor.current !== null) {
      composerRef.current?.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  }, [draft]);
  const [participants,setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Enter an existing room code.");
  const [notifyOnMessage, setNotifyOnMessage] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pickerTab, setPickerTab] = useState("emoji");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const loadedSlugRef = useRef("");
  const lastSeenIdRef = useRef(0);
  const initializedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followBottom = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if(!showEmojiPicker)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setShowEmojiPicker(false);composerRef.current?.focus();}};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[showEmojiPicker]);

  useEffect(() => {
    if (!attachment) { setAttachmentPreview(""); return; }
    const url=URL.createObjectURL(attachment);setAttachmentPreview(url);
    return ()=>URL.revokeObjectURL(url);
  }, [attachment]);

  function chooseImage(file?: File) {
    if (!file || isSending) return;
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) {setStatus('Use a PNG, JPEG, WebP, or GIF image.');return;}
    if(file.size>10*1024*1024){setStatus('Images must be 10 MB or smaller.');return;}
    setAttachment(file);setStatus('Image attached. Add an optional message, then Send.');
  }

  useEffect(() => {
    const latestId = messages.at(-1)?.id || 0;
    setLastSeenId(latestId);
    lastSeenIdRef.current = latestId;
    if (followBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => { notifyRef.current = notifyOnMessage; }, [notifyOnMessage]);

  useEffect(() => {
    loadedSlugRef.current = loadedSlug;
  }, [loadedSlug]);

  const normalizedSlug = useMemo(() => cleanSlug(slug), [slug]);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !normalizedSlug) return "";
    return `${window.location.origin}/${normalizedSlug}`;
  }, [normalizedSlug]);

  const loadMessages = useCallback(async (targetSlug: string, quiet = false) => {
    const safeSlug = cleanSlug(targetSlug);
    if (!safeSlug) {
      setStatus("Enter a room.");
      return;
    }

    if (quiet && (polling.current || sendingRef.current)) return;
    if (quiet) polling.current = true;
    if (!quiet) {polling.current=false;roomRequest.current++; loadedSlugRef.current = safeSlug; followBottom.current=true; fetchedId.current=0; seenIds.current=new Set();}
    const requestId = roomRequest.current;
    activeRead.current?.abort();
    const controller=new AbortController();activeRead.current=controller;
    const deadline=setTimeout(()=>controller.abort(),12000);
    try {
      if (!quiet) setStatus("Loading room...");
      const after = quiet ? fetchedId.current : 0;
      const response = await fetch(`/api/rooms/${safeSlug}/messages?after=${after}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json()) as MessagesResponse;
      if (!response.ok) {
        if (!controller.signal.aborted && response.status === 404 && requestId === roomRequest.current) {setLoadedSlug('');loadedSlugRef.current='';setMessages([]);}
        throw new Error(data.error || "Load failed.");
      }

      if (controller.signal.aborted || requestId !== roomRequest.current || (quiet && loadedSlugRef.current !== safeSlug)) return;
      if (quiet && sendingRef.current) return;
      setParticipants(data.participants || []);
      const incoming = [...(data.messages || []),...(data.events || [])].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id-b.id);
      const fresh = incoming.filter(message=>!seenIds.current.has(message.id));
      for(const message of incoming) seenIds.current.add(message.id);
      fetchedId.current = Math.max(fetchedId.current,...incoming.map(message=>message.id));


      setMessages(incoming);

      setLoadedSlug(safeSlug);
      setSlug(safeSlug);
      setStatus(incoming.length ? "Loaded." : quiet ? "No new messages." : "Room ready.");

      if (quiet && fresh.length > 0) {
        sound.play();
        for(const message of fresh) flashNotification(message);
      }
    } catch (error) {
      if(activeRead.current===controller)setStatus(controller.signal.aborted?"Connection interrupted — retrying…":error instanceof Error ? error.message : "Load failed.");
    } finally { clearTimeout(deadline);if(activeRead.current===controller){activeRead.current=null;if(quiet)polling.current=false;} }
  }, [sound.play]);

  usePresence(loadedSlug,displayName,()=>{
    roomRequest.current++;setLoadedSlug('');loadedSlugRef.current='';setMessages([]);setParticipants([]);
    setStatus('You were removed or the room closed. Open the room again to rejoin if it is available.');
  });

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const pathSlug = cleanSlug(window.location.pathname.replace(/^\/+/, ""));
    const startingSlug = pathSlug;
    const storedName = window.localStorage.getItem("clear-chat-name") || "";
    setDisplayName(storedName);
    if (startingSlug) void loadMessages(startingSlug);
    else setStatus("Enter a room code supplied by the admin.");
  }, [loadMessages]);

  useEffect(() => {
    if (!loadedSlug) return;
    const timer = window.setInterval(() => {
      void loadMessages(loadedSlugRef.current, true);
    }, 2500);

    const resume=()=>{if(document.visibilityState!=='visible')return;activeRead.current?.abort();activeRead.current=null;polling.current=false;void loadMessages(loadedSlugRef.current,true);};
    document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',resume);window.addEventListener('online',resume);
    return () => {window.clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);activeRead.current?.abort();activeRead.current=null;polling.current=false;};
  }, [loadedSlug, loadMessages]);

  function flashNotification(message: ChatMessage) {
    const sender=message.displayName||"Someone";
    const system=message.kind==="system";
    const title=system?message.body:`New message from ${sender}`;
    if (!notifyRef.current || document.visibilityState === "visible") return;

    const originalTitle = document.title;
    document.title = title;
    window.setTimeout(() => {
      document.title = originalTitle;
    }, 3500);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(system?"Chat activity":"New chat message", {
        body: system?message.body:`${sender} posted in /${loadedSlugRef.current}`,
      });
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setStatus("This browser does not support desktop notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setStatus(
      permission === "granted"
        ? "Desktop notifications enabled."
        : "Desktop notifications were not enabled."
    );
  }

  function openRoom(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;
    setAttachment(null);
    const safeSlug = normalizedSlug;
    if (!safeSlug) { setStatus("Enter an existing room code."); return; }
    setLoadedSlug("");
    window.history.pushState(null, "", `/${safeSlug}`);
    setMessages([]);
    void loadMessages(safeSlug);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const safeSlug = loadedSlug;
    if (!safeSlug) { setStatus("Open an existing room first."); return; }
    const safeName = displayName.trim() || "Guest";
    const body = convertEmoticons(draft.trim(), true);
    if (sendingRef.current || isSending || (!body && !attachment)) return;

    sendingRef.current=true;
    setIsSending(true);
    setStatus("Sending...");
    const sendController=new AbortController();
    const sendTimeout=window.setTimeout(()=>sendController.abort(),60000);
    window.localStorage.setItem("clear-chat-name", safeName);

    try {
      const form = new FormData();
      form.set('displayName',safeName);form.set('body',body);
      if(attachment)form.set('image',attachment);
      const response = await fetch(`/api/rooms/${safeSlug}/messages`, {
        method: "POST",
        headers: attachment ? undefined : { "Content-Type": "application/json" },
        body: attachment ? form : JSON.stringify({ displayName: safeName, body }),
        signal:sendController.signal,
      });
      const responseText=await response.text();
      let data: MessagesResponse;
      try { data=JSON.parse(responseText) as MessagesResponse; }
      catch {
        if(response.status===413)throw new Error("Upload rejected as too large. Images must be 10 MB or smaller. Check that Chat Build 22 is deployed.");
        throw new Error(`Send returned an unexpected response (HTTP ${response.status}). Your draft is kept; check the chat before retrying.`);
      }

      if (!response.ok) throw new Error(data.error || "Send failed.");

      if (data.message) {
        seenIds.current.add(data.message.id);
        setMessages((current) => current.some(item => item.id === data.message!.id) ? current : [...current, data.message as ChatMessage].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id-b.id));
      }
      setDraft("");
      setAttachment(null);
      setLoadedSlug(safeSlug);
      setSlug(safeSlug);
      window.history.pushState(null, "", `/${safeSlug}`);
      setStatus("Sent.");
    } catch (error) {
      setStatus(sendController.signal.aborted ? "Send timed out. Check the chat before retrying; your attachment is still selected." : error instanceof Error ? error.message : "Send failed.");
    } finally {
      window.clearTimeout(sendTimeout);
      sendingRef.current=false;
      setIsSending(false);
      if (window.matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
    }
  }

  async function copyLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy failed. Select the URL manually.");
    }
  }

  function addEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
  }

  return (
    <main className="chat-viewport bg-[#07111d] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-5">
        <header className="chat-app-header shrink-0 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-base font-black">Chat</p>
              <p className="text-sm text-slate-400">Shared chat rooms · Build 25</p>
            </div>
          </div>
          <button type="button" className="lg:hidden rounded border border-white/20 px-3 py-2 text-sm" aria-expanded={showRoomDetails} onClick={()=>setShowRoomDetails(v=>!v)}>Room / people</button>
          <a href="/admin" className="text-sm text-slate-300 underline">Admin</a>
        </header>

        <section className="grid min-h-0 flex-1 grid-rows-1 gap-5 lg:grid-cols-[360px_1fr] lg:grid-rows-1">
          <aside className={`chat-room-details chat-scroll min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-white/[.05] p-5 shadow-2xl shadow-black/25 ${showRoomDetails ? "details-open" : ""}`}>
            <button type="button" className="mb-3 rounded border border-white/20 px-3 py-2 lg:hidden" onClick={()=>setShowRoomDetails(false)}>Back to chat</button>
            {loadedSlug && <section className="mb-5 rounded-lg border border-white/15 p-3" aria-label="Participants">
              <h2 className="font-bold">People · {participants.filter(p=>p.online).length} online</h2>
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{participants.map(p=><li key={p.name} className="flex justify-between gap-3 text-sm"><span className="break-all" style={{color:p.authorColor}}>{p.name}</span><span className={p.online?'text-cyan-200':'text-slate-400'}>{p.online?'● Online':'○ Offline'}</span></li>)}</ul>
              {!participants.length && <p className="mt-2 text-sm text-slate-400">Joining…</p>}
              <button type="button" className="mt-3 text-sm underline" onClick={()=>{roomRequest.current++;setLoadedSlug('');loadedSlugRef.current='';setMessages([]);setParticipants([]);setStatus('You left the room. Open it again to rejoin.');}}>Leave room</button>
            </section>}
            {loadedSlug ? <VideoCall key={loadedSlug} room={loadedSlug} name={displayName} /> : null}
            <h1 className="text-3xl font-black tracking-tight">Chat Room</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Enter a room code or open a link supplied by the admin. Only admins can create rooms.
            </p>

            <form onSubmit={openRoom} className="mt-6 space-y-3">
              <label htmlFor="roomName" className="block text-sm font-bold text-slate-300">
                Room code
              </label>
              <input
                id="roomName"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-cyan-300/40 focus:ring-4"
                spellCheck={false}
              />
              <button
                type="submit"
                className="h-11 w-full rounded-md bg-cyan-400 px-4 text-sm font-black text-slate-950 hover:bg-cyan-300"
              >
                Open
              </button>
            </form>

            <div className="mt-5 space-y-3">
              <label htmlFor="displayName" className="block text-sm font-bold text-slate-300">
                Your name
              </label>
              <input
                id="displayName"
                maxLength={32}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Guest"
                className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-cyan-300/40 focus:ring-4"
              />
            </div>

            <div className="mt-5 rounded-md border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Share link</p>
              <p className="mt-2 break-all text-sm text-slate-200">{shareUrl || "Open a room first."}</p>
              <button
                type="button"
                onClick={copyLink}
                className="mt-3 rounded-md border border-white/15 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
              >
                Copy link
              </button>
            </div>

            <button type="button" onClick={()=>void sound.toggle()} aria-pressed={sound.enabled} className="mt-5 rounded-md border border-cyan-300/30 px-3 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10">
              {sound.enabled ? sound.ready ? "Message sound: on" : "Enable message sound" : "Message sound: off"}
            </button>
            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={notifyOnMessage}
                onChange={(event) => setNotifyOnMessage(event.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
              Notify me when new messages arrive
            </label>

            <button
              type="button"
              onClick={enableNotifications}
              className="mt-3 rounded-md border border-cyan-300/30 px-3 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10"
            >
              Enable desktop notifications
            </button>

            <div className="mt-5 text-sm text-slate-400">
              <p>Status: <span className="text-slate-100">{status}</span></p>
              <p className="mt-1">Latest message ID: {lastSeenId || "none"}</p>
            </div>
          </aside>

          <section className="chat-conversation flex min-h-0 flex-col rounded-lg border border-white/10 bg-white/[.05] shadow-2xl shadow-black/25">
            <div className="chat-room-heading shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.14em] text-cyan-200">
                  {loadedSlug ? `/${loadedSlug}` : "Open a room"}
                </p>
                <p className="text-sm text-slate-400">{messages.length} messages</p>
              </div>
            </div>

            {attention.notice&&<div role="alert" className="shrink-0 border-b border-amber-300/30 bg-amber-300/15 px-4 py-3 font-bold text-amber-100">{attention.notice}</div>}
            <div ref={scrollRef} onScroll={event=>{const el=event.currentTarget;followBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} className="chat-messages chat-scroll min-h-0 flex-1 overflow-y-auto bg-slate-950/55 p-5">
              <div className="flex min-h-full flex-col justify-end gap-3">
              <MessageBlocks messages={messages} viewerName={displayName.trim()||"Guest"} onBonk={name=>void attention.bonk(name)} bonkBusy={attention.sending} onImageLoad={()=>{if(followBottom.current && scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;}} />
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-slate-400">
                  No messages yet. Send the first one.
                </div>
              ) : null}
              <div ref={messagesEndRef} />
              </div>
            </div>

            <form onSubmit={sendMessage} className="chat-composer relative flex shrink-0 flex-wrap gap-3 border-t border-white/10 p-4" onPaste={event=>{const item=Array.from(event.clipboardData.items).find(item=>item.kind==='file' && item.type.startsWith('image/'));if(item){event.preventDefault();chooseImage(item.getAsFile() || undefined);}}}>
              {draft.includes("https://") && <div className="composer-preview max-h-36 w-full overflow-y-auto"><GifMessage body={draft} previewOnly/></div>}
              {attachmentPreview && <div className="composer-attachment flex w-full items-center gap-3 rounded border border-cyan-300/20 bg-slate-950/60 p-2">
                <img src={attachmentPreview} alt="Image ready to send" className="h-16 max-w-32 rounded object-contain" />
                <span className="min-w-0 flex-1 truncate text-sm">{attachment?.name}</span>
                <button type="button" disabled={isSending} onClick={()=>setAttachment(null)} className="px-3 py-2 text-sm">Remove attachment</button>
              </div>}
              <label title="Attach image" aria-label="Attach image" className="composer-attach order-2 cursor-pointer rounded border sm:order-none border-white/20 px-3 py-3 text-sm"><span className="attach-label">Attach image</span><span className="attach-symbol" aria-hidden="true">＋</span><input aria-label="Attach image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={isSending} className="sr-only" onChange={event=>{chooseImage(event.target.files?.[0]);event.target.value='';}} /></label>
              <div className="composer-input relative order-1 min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">
                {showEmojiPicker ? (
                  <div className="chat-picker absolute bottom-14 left-0 z-10 w-[min(22rem,80vw)] max-w-sm rounded-lg border border-white/15 bg-slate-950 p-3 shadow-2xl shadow-black/40">
                    <div className="mb-3 flex gap-4"><button type="button" onClick={()=>setPickerTab("emoji")} className={pickerTab==="emoji"?"text-cyan-300":""}>Emoji</button><button type="button" onClick={()=>setPickerTab("gif")} className={pickerTab==="gif"?"text-cyan-300":""}>GIFs</button><button type="button" className="ml-auto" onClick={()=>setShowEmojiPicker(false)} aria-label="Close picker">×</button></div>
                    {pickerTab==="gif" ? <GifPicker onSelect={url=>{setDraft(current=>(current+" "+url).trim().slice(0,2000));setShowEmojiPicker(false);composerRef.current?.focus();}} /> : <div className="grid grid-cols-5 gap-2">{EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addEmoji(emoji)}
                        className="grid h-10 place-items-center rounded-md text-xl hover:bg-white/10"
                        aria-label={`Add emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}</div>}
                  </div>
                ) : null}
                <textarea
                  ref={composerRef}
                  rows={1}
                  aria-label="Message"
                  onFocus={() => { setShowRoomDetails(false); followBottom.current = true; }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                      event.preventDefault();
                      if (!isSending && !event.repeat) event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  readOnly={isSending}
                  value={draft}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const raw = input.value;
                    pendingCursor.current = null;
                    if ((event.nativeEvent as InputEvent).isComposing) { setDraft(raw); return; }
                    const cursor = input.selectionStart ?? raw.length;
                    const converted = convertEmoticons(raw);
                    setDraft(converted);
                    if (converted !== raw) {
                      const nextCursor = convertEmoticons(raw.slice(0, cursor)).length;
                      pendingCursor.current = nextCursor;
                    }
                  }}
                  placeholder="Type a message… Enter to send, Shift+Enter for a new line"
                  className="h-20 max-h-40 min-h-12 resize-y w-full rounded-md border border-white/15 bg-slate-950/70 px-3 py-2 text-base text-white outline-none ring-cyan-300/40 focus:ring-4"
                  maxLength={2000}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="composer-emoji order-2 h-12 rounded-md border border-white/15 px-4 text-xl sm:order-none text-slate-100 hover:bg-white/10"
                aria-label="Open emoji picker"
              >
                😀
              </button>
              <button
                type="submit"
                disabled={!loadedSlug || isSending || (!draft.trim() && !attachment)}
                onPointerDown={event => { if (document.activeElement === composerRef.current) event.preventDefault(); }}
                className="composer-send order-2 h-12 rounded-md bg-white px-6 sm:order-none text-sm font-black text-slate-950 hover:bg-cyan-100 disabled:opacity-60"
              >
                {isSending ? "Sending" : "Send"}
              </button>
            <p role="status" aria-live="polite" className="composer-status w-full text-xs text-slate-200">{status}</p>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
