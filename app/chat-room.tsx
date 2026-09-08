"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function randomSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 4 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

type ChatMessage = {
  id: number;
  roomSlug: string;
  displayName: string;
  body: string;
  createdAt: string;
};

type MessagesResponse = {
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
  "🚀",
];

export function ChatRoom({ initialSlug }: { initialSlug?: string }) {
  const [slug, setSlug] = useState(initialSlug || "");
  const [loadedSlug, setLoadedSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Enter a room or make a new one.");
  const [notifyOnMessage, setNotifyOnMessage] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const loadedSlugRef = useRef("");
  const lastSeenIdRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    const latestId = messages.at(-1)?.id || 0;
    setLastSeenId(latestId);
    lastSeenIdRef.current = latestId;
  }, [messages]);

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

    try {
      if (!quiet) setStatus("Loading room...");
      const after = quiet ? lastSeenIdRef.current : 0;
      const response = await fetch(`/api/rooms/${safeSlug}/messages?after=${after}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as MessagesResponse;
      if (!response.ok) throw new Error(data.error || "Load failed.");

      const incoming = data.messages || [];
      if (quiet && incoming.length === 0) return;

      setMessages((current) => {
        if (!quiet) return incoming;
        const existing = new Set(current.map((message) => message.id));
        return [...current, ...incoming.filter((message) => !existing.has(message.id))];
      });

      setLoadedSlug(safeSlug);
      setSlug(safeSlug);
      setStatus(incoming.length ? "Loaded." : quiet ? "No new messages." : "Room ready.");

      if (quiet && incoming.length > 0) {
        flashNotification(incoming.at(-1)?.displayName || "Someone");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load failed.");
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const pathSlug = cleanSlug(window.location.pathname.replace(/^\/+/, ""));
    const startingSlug = pathSlug || randomSlug();
    const storedName = window.localStorage.getItem("clear-chat-name") || "";
    setDisplayName(storedName);
    void loadMessages(startingSlug);
  }, [loadMessages]);

  useEffect(() => {
    if (!loadedSlug) return;
    const timer = window.setInterval(() => {
      void loadMessages(loadedSlugRef.current, true);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loadedSlug, loadMessages]);

  function flashNotification(sender: string) {
    if (!notifyOnMessage || document.visibilityState === "visible") return;

    const originalTitle = document.title;
    document.title = `New message from ${sender}`;
    window.setTimeout(() => {
      document.title = originalTitle;
    }, 3500);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("New chat message", {
        body: `${sender} posted in /${loadedSlugRef.current}`,
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
    const safeSlug = normalizedSlug || randomSlug();
    window.history.pushState(null, "", `/${safeSlug}`);
    setMessages([]);
    void loadMessages(safeSlug);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const safeSlug = normalizedSlug || loadedSlug || randomSlug();
    const safeName = displayName.trim() || "Guest";
    const body = draft.trim();
    if (!body) return;

    setIsSending(true);
    setStatus("Sending...");
    window.localStorage.setItem("clear-chat-name", safeName);

    try {
      const response = await fetch(`/api/rooms/${safeSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: safeName, body }),
      });
      const data = (await response.json()) as MessagesResponse;
      if (!response.ok) throw new Error(data.error || "Send failed.");

      if (data.message) {
        setMessages((current) => [...current, data.message as ChatMessage]);
      }
      setDraft("");
      setLoadedSlug(safeSlug);
      setSlug(safeSlug);
      window.history.pushState(null, "", `/${safeSlug}`);
      setStatus("Sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Send failed.");
    } finally {
      setIsSending(false);
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

  function newRoom() {
    const nextSlug = randomSlug();
    window.history.pushState(null, "", `/${nextSlug}`);
    setMessages([]);
    void loadMessages(nextSlug);
  }

  function addEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
  }

  return (
    <main className="min-h-screen bg-[#07111d] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/60 bg-cyan-400/15 text-sm font-black tracking-[.08em]">
              CTS
            </div>
            <div>
              <p className="text-base font-black">Clear Technology Solutions</p>
              <p className="text-sm text-slate-400">Shared chat rooms</p>
            </div>
          </div>
          <button
            type="button"
            onClick={newRoom}
            className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-300/20"
          >
            New room
          </button>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-white/10 bg-white/[.05] p-5 shadow-2xl shadow-black/25">
            <h1 className="text-3xl font-black tracking-tight">Chat Room</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Give someone a room URL like /abcd. Anyone with the link can join and send short messages.
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

          <section className="flex min-h-[620px] flex-col rounded-lg border border-white/10 bg-white/[.05] shadow-2xl shadow-black/25">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.14em] text-cyan-200">
                  /{loadedSlug || normalizedSlug || "new"}
                </p>
                <p className="text-sm text-slate-400">{messages.length} messages</p>
              </div>
            </div>

            <div className="flex min-h-[460px] flex-1 flex-col-reverse gap-3 overflow-y-auto bg-slate-950/55 p-5">
              {[...messages].reverse().map((message) => (
                <article key={message.id} className="rounded-lg border border-white/10 bg-white/[.04] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-cyan-100">{message.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-100">
                    {message.body}
                  </p>
                </article>
              ))}
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-slate-400">
                  No messages yet. Send the first one.
                </div>
              ) : null}
            </div>

            <form onSubmit={sendMessage} className="relative flex gap-3 border-t border-white/10 p-4">
              <div className="relative min-w-0 flex-1">
                {showEmojiPicker ? (
                  <div className="absolute bottom-14 left-0 z-10 grid w-full max-w-sm grid-cols-5 gap-2 rounded-lg border border-white/15 bg-slate-950 p-3 shadow-2xl shadow-black/40">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addEmoji(emoji)}
                        className="grid h-10 place-items-center rounded-md text-xl hover:bg-white/10"
                        aria-label={`Add emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message..."
                  className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-cyan-300/40 focus:ring-4"
                  maxLength={2000}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="h-12 rounded-md border border-white/15 px-4 text-xl text-slate-100 hover:bg-white/10"
                aria-label="Open emoji picker"
              >
                😀
              </button>
              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="h-12 rounded-md bg-white px-6 text-sm font-black text-slate-950 hover:bg-cyan-100 disabled:opacity-60"
              >
                {isSending ? "Sending" : "Send"}
              </button>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
