"use client";

import { FormEvent, useMemo, useState } from "react";

type AdminMessage = {
  id: number;
  displayName: string;
  body: string;
  createdAt: string;
};

type AdminRoom = {
  roomSlug: string;
  latestAt: string;
  messageCount: number;
  messages: AdminMessage[];
};

type AdminResponse = {
  rooms?: AdminRoom[];
  error?: string;
};

type AdminActionResponse = {
  ok?: boolean;
  error?: string;
};

export function AdminMessages() {
  const [password, setPassword] = useState("");
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [status, setStatus] = useState("Enter the admin password.");
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomSlug === selectedRoom) || rooms[0],
    [rooms, selectedRoom]
  );

  const totalMessages = useMemo(
    () => rooms.reduce((sum, room) => sum + room.messageCount, 0),
    [rooms]
  );

  async function loadMessages(event?: FormEvent) {
    event?.preventDefault();
    setIsLoading(true);
    setStatus("Loading chat rooms...");

    try {
      const response = await fetch("/api/admin/messages", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${password}`,
        },
      });
      const data = (await response.json()) as AdminResponse;
      if (!response.ok) throw new Error(data.error || "Admin load failed.");

      const nextRooms = data.rooms || [];
      setRooms(nextRooms);
      setSelectedRoom((current) =>
        nextRooms.some((room) => room.roomSlug === current)
          ? current
          : nextRooms[0]?.roomSlug || ""
      );
      setHasLoaded(true);
      setStatus("Loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin load failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runAdminAction(action: "cleanup-old" | "delete-room") {
    if (action === "delete-room" && !activeRoom) return;

    const roomSlug = activeRoom?.roomSlug || "";
    const confirmed =
      action === "cleanup-old"
        ? window.confirm("Delete all chat messages older than 30 days?")
        : window.confirm(`Delete every message in /${roomSlug}?`);

    if (!confirmed) return;

    setIsLoading(true);
    setStatus(action === "cleanup-old" ? "Cleaning old messages..." : `Deleting /${roomSlug}...`);

    try {
      const response = await fetch("/api/admin/messages", {
        method: "DELETE",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${password}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          action === "cleanup-old" ? { action } : { action, roomSlug }
        ),
      });
      const data = (await response.json()) as AdminActionResponse;
      if (!response.ok) throw new Error(data.error || "Admin action failed.");

      setStatus(action === "cleanup-old" ? "Old messages cleaned." : `Deleted /${roomSlug}.`);
      await loadMessages();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin action failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#07111d] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-5">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/60 bg-cyan-400/15 text-sm font-black tracking-[.08em]">
              CTS
            </div>
            <div>
              <p className="text-base font-black">Clear Technology Solutions</p>
              <p className="text-sm text-slate-400">Chat admin</p>
            </div>
          </a>
          <a
            href="/"
            className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-300/20"
          >
            Back to chat
          </a>
        </header>

        <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-white/[.05] p-5 shadow-2xl shadow-black/25">
            <h1 className="text-3xl font-black tracking-tight">Admin</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Read saved chat rooms and messages.
            </p>

            <form onSubmit={loadMessages} className="mt-6 space-y-3">
              <label htmlFor="adminPassword" className="block text-sm font-bold text-slate-300">
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-cyan-300/40 focus:ring-4"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="h-11 w-full rounded-md bg-cyan-400 px-4 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              >
                {isLoading ? "Loading" : "Unlock"}
              </button>
            </form>

            <div className="mt-5 rounded-md border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Summary</p>
              <p className="mt-2 text-sm text-slate-200">{rooms.length} rooms</p>
              <p className="mt-1 text-sm text-slate-400">{totalMessages} recent messages</p>
            </div>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => runAdminAction("cleanup-old")}
                disabled={!hasLoaded || isLoading}
                className="h-11 w-full rounded-md border border-white/15 px-4 text-sm font-bold text-slate-100 hover:bg-white/10 disabled:opacity-50"
              >
                Clean old messages
              </button>
              <button
                type="button"
                onClick={() => runAdminAction("delete-room")}
                disabled={!activeRoom || isLoading}
                className="h-11 w-full rounded-md border border-red-300/35 bg-red-500/10 px-4 text-sm font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
              >
                Delete selected room
              </button>
            </div>

            <p className="mt-5 text-sm text-slate-300">
              Status: <span className="text-slate-100">{status}</span>
            </p>

            <div className="mt-5 space-y-2">
              {rooms.map((room) => (
                <button
                  key={room.roomSlug}
                  type="button"
                  onClick={() => setSelectedRoom(room.roomSlug)}
                  className={`w-full rounded-md border px-3 py-3 text-left hover:bg-white/10 ${
                    activeRoom?.roomSlug === room.roomSlug
                      ? "border-cyan-300/60 bg-cyan-300/10"
                      : "border-white/10 bg-slate-950/35"
                  }`}
                >
                  <span className="block font-mono text-sm font-black text-cyan-100">
                    /{room.roomSlug}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {room.messageCount} messages, {new Date(room.latestAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-lg border border-white/10 bg-white/[.05] shadow-2xl shadow-black/25">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.14em] text-cyan-200">
                  {activeRoom ? `/${activeRoom.roomSlug}` : "No room selected"}
                </p>
                <p className="text-sm text-slate-400">
                  {activeRoom ? `${activeRoom.messageCount} recent messages` : "Unlock admin view first."}
                </p>
              </div>
              {activeRoom ? (
                <a
                  href={`/${activeRoom.roomSlug}`}
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                >
                  Open room
                </a>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950/55 p-5">
              {!hasLoaded ? (
                <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-slate-400">
                  Unlock admin view to read chats.
                </div>
              ) : !activeRoom ? (
                <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-slate-400">
                  No chats yet.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {activeRoom.messages.map((message) => (
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
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
