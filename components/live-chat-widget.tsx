"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, LoaderCircle, ShieldCheck } from "lucide-react";

type WidgetSettings = {
  title: string;
  welcomeMessage: string;
  primaryColor: string;
  theme: "LIGHT" | "DARK";
  position: "LEFT" | "RIGHT";
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  offlineMode: boolean;
};
type WidgetConfig = { company: { name: string; slug: string }; accessToken: string; settings: WidgetSettings; cooldownSeconds: number; retentionDays: number };
type Message = { id: string; senderType: "CUSTOMER" | "AGENT"; body: string; createdAt: string; senderName?: string; senderAvatar?: string };
type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string; details?: { retryAt?: string } };

const STORAGE_PREFIX = "conventus:live-chat:v1:";

function randomVisitorId() {
  try {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

async function api<T>(url: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(accessToken ? { "x-conventus-live-chat-token": accessToken } : {}), ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || !body.ok || body.data === undefined) {
    const error = new Error(body.error ?? "REQUEST_FAILED") as Error & { code?: string; details?: { retryAt?: string } };
    error.code = body.error;
    error.details = body.details;
    throw error;
  }
  return body.data;
}

export default function LiveChatWidget({ companySlug }: { companySlug: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [verifiedSiteOrigin, setVerifiedSiteOrigin] = useState("");
  const [verifiedSiteUrl, setVerifiedSiteUrl] = useState("");
  const [configError, setConfigError] = useState("");
  const [opened, setOpened] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const [nextAllowedAt, setNextAllowedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMessageAtRef = useRef(0);
  const companyKey = useMemo(() => STORAGE_PREFIX + companySlug, [companySlug]);
  const theme = config?.settings.theme === "DARK";

  useEffect(() => {
    if (window.parent === window) return;
    let initialized = false;
    const sendReady = () => {
      if (!initialized) {
        // The ready ping contains no visitor or customer data. The parent
        // responds with the verified page origin after checking this iframe.
        window.parent.postMessage({ type: "conventus-live-chat-ready" }, "*");
      }
    };
    const initialize = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: unknown; siteOrigin?: unknown; siteUrl?: unknown } | null;
      if (!data || data.type !== "conventus-live-chat-init" || typeof data.siteOrigin !== "string") return;
      if (event.origin !== data.siteOrigin) return;
      let parsed: URL;
      try { parsed = new URL(event.origin); } catch { return; }
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      let siteUrl = event.origin;
      if (typeof data.siteUrl === "string") {
        try {
          const parsedSiteUrl = new URL(data.siteUrl);
          if (parsedSiteUrl.origin !== event.origin || !["http:", "https:"].includes(parsedSiteUrl.protocol)) return;
          parsedSiteUrl.search = "";
          parsedSiteUrl.hash = "";
          siteUrl = parsedSiteUrl.toString();
        } catch { return; }
      }
      initialized = true;
      window.clearInterval(retryTimer);
      setVerifiedSiteOrigin(event.origin);
      setVerifiedSiteUrl(siteUrl);
    };
    window.addEventListener("message", initialize);
    sendReady();
    const retryTimer = window.setInterval(sendReady, 500);
    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener("message", initialize);
    };
  }, []);

  const notifyParent = useCallback((isOpen: boolean) => {
    if (typeof window === "undefined" || window.parent === window || !verifiedSiteOrigin) return;
    window.parent.postMessage({
      type: "conventus-live-chat-resize",
      open: isOpen,
      width: isOpen ? 380 : 76,
      height: isOpen ? 620 : 76,
      position: config?.settings.position === "LEFT" ? "left" : "right"
    }, verifiedSiteOrigin);
  }, [config?.settings.position, verifiedSiteOrigin]);

  const refreshConfig = useCallback(async () => {
    if (!verifiedSiteOrigin || !visitorId) return null;
    const data = await api<WidgetConfig>(`/api/public/live-chat/${encodeURIComponent(companySlug)}?site=${encodeURIComponent(verifiedSiteOrigin)}&visitorId=${encodeURIComponent(visitorId)}`);
    setConfig(data);
    setAccessToken(data.accessToken);
    setConfigError("");
    return data;
  }, [companySlug, verifiedSiteOrigin, visitorId]);

  useEffect(() => {
    let active = true;
    // Fetch public widget configuration after the verified parent-origin handshake.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshConfig().catch((cause) => { if (active) setConfigError((cause as Error).message); });
    return () => { active = false; };
  }, [refreshConfig]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshConfig().catch(() => undefined);
    };
    const timer = window.setInterval(refreshWhenVisible, opened ? 3000 : 10000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshConfig, opened]);

  useEffect(() => {
    try {
      let storedVisitor = localStorage.getItem(companyKey + ":visitor");
      if (!storedVisitor || !/^[a-zA-Z0-9_-]{16,100}$/.test(storedVisitor)) {
        storedVisitor = randomVisitorId();
        localStorage.setItem(companyKey + ":visitor", storedVisitor);
      }
      // Hydrate visitor identity from browser storage after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisitorId(storedVisitor);
      const storedConversation = localStorage.getItem(companyKey + ":conversation") ?? "";
      if (/^[a-f0-9]{24}$/i.test(storedConversation)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConversationId(storedConversation);
      }
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisitorId(randomVisitorId());
    }
  }, [companyKey]);

  useEffect(() => {
    notifyParent(opened);
    const onResize = () => notifyParent(opened);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [opened, notifyParent]);

  useEffect(() => {
    if (!nextAllowedAt) return;
    const tick = () => { if (!document.hidden) setClock(Date.now()); };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [nextAllowedAt]);

  const cooldownSecondsLeft = nextAllowedAt && clock > 0
    ? Math.max(0, Math.ceil((nextAllowedAt.getTime() - clock) / 1000))
    : 0;

  const startConversation = async () => {
    if (!config || !visitorId || !verifiedSiteOrigin || starting) return;
    setStarting(true);
    setError("");
    try {
      const data = await api<{ conversation: { id: string; nextCustomerMessageAt?: string | null; expiresAt: string }; existing?: boolean }>(
        `/api/public/live-chat/${encodeURIComponent(companySlug)}/conversations`,
        { method: "POST", body: JSON.stringify({ visitorId, siteOrigin: verifiedSiteOrigin, referrer: verifiedSiteUrl, contact: { name, email, phone } }) }, accessToken
      );
      setConversationId(data.conversation.id);
      try { localStorage.setItem(companyKey + ":conversation", data.conversation.id); } catch { /* ephemeral mode */ }
      setNextAllowedAt(data.conversation.nextCustomerMessageAt ? new Date(data.conversation.nextCustomerMessageAt) : null);
    } catch (cause) {
      const e = cause as Error & { code?: string };
      setError(e.code ?? e.message);
    } finally {
      setStarting(false);
    }
  };

  const loadMessages = useCallback(async (quiet = false) => {
    if (!conversationId || !visitorId || !config) return;
    if (!quiet) setLoadingMessages(true);
    try {
      const url = `/api/public/live-chat/${encodeURIComponent(companySlug)}/conversations/${encodeURIComponent(conversationId)}/messages?visitorId=${encodeURIComponent(visitorId)}&site=${encodeURIComponent(verifiedSiteOrigin)}`;
      const data = await api<{ messages: Message[]; conversation: { nextCustomerMessageAt?: string | null } }>(url, undefined, accessToken);
      const latest = data.messages[data.messages.length - 1];
      lastMessageAtRef.current = latest ? (Date.parse(latest.createdAt) || Date.now()) : 0;
      setMessages(data.messages);
      setNextAllowedAt(data.conversation.nextCustomerMessageAt ? new Date(data.conversation.nextCustomerMessageAt) : null);
      setError("");
    } catch (cause) {
      const e = cause as Error & { code?: string };
      if (e.code === "LIVE_CHAT_CONVERSATION_NOT_FOUND") {
        setConversationId("");
        setMessages([]);
        try { localStorage.removeItem(companyKey + ":conversation"); } catch { /* ephemeral mode */ }
      } else if (!quiet) setError(e.code ?? e.message);
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  }, [companySlug, companyKey, config, conversationId, verifiedSiteOrigin, visitorId, accessToken]);

  const loadMessagesRef = useRef(loadMessages);
  const configLoaded = Boolean(config);

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  useEffect(() => {
    if (!opened || !conversationId || !configLoaded) return;
    let disposed = false;
    let timer: number | undefined;
    const schedule = () => {
      if (disposed) return;
      const recentlyActive = Date.now() - lastMessageAtRef.current < 5 * 60 * 1000;
      timer = window.setTimeout(async () => {
        if (document.hidden) {
          timer = undefined;
          return;
        }
        await loadMessagesRef.current(true);
        schedule();
      }, recentlyActive ? 3000 : 12000);
    };
    const refreshWhenVisible = () => {
      if (document.hidden) return;
      if (timer !== undefined) window.clearTimeout(timer);
      void loadMessagesRef.current(true).finally(schedule);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMessagesRef.current().finally(schedule);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [opened, conversationId, configLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const latest = messages[messages.length - 1];
    if (latest) lastMessageAtRef.current = Date.parse(latest.createdAt) || Date.now();
  }, [messages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || body.length > 2000 || !conversationId || !visitorId || sending || cooldownSecondsLeft > 0) return;
    setSending(true);
    setError("");
    try {
      const url = `/api/public/live-chat/${encodeURIComponent(companySlug)}/conversations/${encodeURIComponent(conversationId)}/messages?visitorId=${encodeURIComponent(visitorId)}&site=${encodeURIComponent(verifiedSiteOrigin)}`;
      await api<{ message: Message; nextCustomerMessageAt: string }>(url, {
        method: "POST",
        body: JSON.stringify({ body, visitorId, siteOrigin: verifiedSiteOrigin })
      }, accessToken);
      setDraft("");
      await loadMessages(true);
    } catch (cause) {
      const e = cause as Error & { code?: string; details?: { retryAt?: string } };
      if (e.code === "LIVE_CHAT_MESSAGE_COOLDOWN" && e.details?.retryAt) {
        setNextAllowedAt(new Date(e.details.retryAt));
      } else {
        setError(e.code ?? e.message);
      }
    } finally {
      setSending(false);
    }
  };

  const panelClass = theme ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-950";
  const fieldClass = theme ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  if (!config) {
    if (!opened) {
      return (
        <div className="flex h-full items-end justify-end bg-transparent">
          <button
            type="button"
            onClick={() => setOpened(true)}
            aria-label="Open live chat"
            className="grid size-[68px] place-items-center rounded-full text-white shadow-xl ring-4 ring-white/70 transition hover:scale-105"
            style={{ backgroundColor: "#2563eb" }}
          >
            <MessageCircle className="size-7" />
          </button>
        </div>
      );
    }
    return (
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl" aria-label="Live customer chat status">
        <header className="flex shrink-0 items-start gap-3 bg-blue-600 px-4 py-4 text-white">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Live Chat</p>
            <p className="mt-1 text-[11px] text-white/85">Powered by Conventus</p>
          </div>
          <button type="button" onClick={() => setOpened(false)} aria-label="Minimize chat" className="rounded-lg p-1.5 hover:bg-white/15">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
          {configError ? (
            <>
              <MessageCircle className="size-7 text-slate-400" />
              <p>Live Chat is unavailable for this website. Check that the widget is enabled and this website&apos;s domain is allowed.</p>
            </>
          ) : (
            <>
              <LoaderCircle className="size-5 animate-spin text-blue-600" />
              <p>Connecting to Live Chat…</p>
            </>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-center border-t border-slate-100 px-2 py-2 text-[10px] text-slate-400">
          Powered by Conventus
        </footer>
      </section>
    );
  }

  return (
    <div className={opened ? "flex h-full min-h-0 flex-col" : "flex h-full items-end justify-end bg-transparent"}>
      {!opened ? (
        <button type="button" onClick={() => setOpened(true)} aria-label="Open live chat" className="grid size-[68px] place-items-center rounded-full text-white shadow-xl ring-4 ring-white/70 transition hover:scale-105" style={{ backgroundColor: config.settings.primaryColor }}>
          <MessageCircle className="size-7" />
        </button>
      ) : (
        <section className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelClass}`} aria-label="Live customer chat">
          <header className="flex shrink-0 items-start gap-3 px-4 py-4 text-white" style={{ backgroundColor: config.settings.primaryColor }}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{config.settings.title}</p>
              {messages.some((message) => message.senderType === "AGENT") ? (() => {
                const agent = messages.find((message) => message.senderType === "AGENT" && message.senderName);
                const agentName = agent?.senderName || "our support team";
                return <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/90">
                  {agent?.senderAvatar ? <img src={agent.senderAvatar} alt="" referrerPolicy="no-referrer" className="size-4 rounded-full border border-white/40 object-cover" /> : null}
                  <span className="truncate">Chatting with {agentName}</span>
                  <span className={`relative ml-0.5 inline-flex size-2 rounded-full ${config.settings.offlineMode ? "bg-slate-300" : "bg-emerald-300"}`}>{!config.settings.offlineMode && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60" />}</span>
                  <span className="text-[10px]">{config.settings.offlineMode ? "Offline" : "Online"}</span>
                </div>;
              })() : <p className="mt-1 text-[11px] text-white/85">{config.settings.offlineMode ? "Offline · Leave a message" : config.company.name + " · Usually replies promptly"}</p>}
            </div>
            <button type="button" onClick={() => setOpened(false)} aria-label="Minimize chat" className="rounded-lg p-1.5 hover:bg-white/15"><X className="size-4" /></button>
          </header>

          {!conversationId ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <div className={`mb-4 rounded-xl p-3 text-sm leading-6 ${theme ? "bg-slate-900" : "bg-slate-50"}`}>{config.settings.welcomeMessage}</div>
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void startConversation(); }}>
                {config.settings.collectName && <label className="block text-xs font-medium">Name<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${fieldClass}`} /></label>}
                {config.settings.collectEmail && <label className="block text-xs font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${fieldClass}`} /></label>}
                {config.settings.collectPhone && <label className="block text-xs font-medium">Phone<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${fieldClass}`} /></label>}
                <button disabled={starting || !visitorId} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: config.settings.primaryColor }}>
                  {starting ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                  {starting ? "Starting chat…" : "Start chatting"}
                </button>
                {!config.settings.collectName && !config.settings.collectEmail && !config.settings.collectPhone && <p className="text-center text-[11px] text-slate-500">You can start anonymously. Do not share sensitive information.</p>}
              </form>
              {error && <p role="alert" className="mt-3 break-words rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error.replaceAll("_", " ").toLowerCase()}</p>}
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5" aria-live="polite">
                <div className={`mb-2 rounded-xl p-3 text-xs leading-5 ${theme ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-600"}`}>{config.settings.welcomeMessage}</div>
                {loadingMessages && messages.length === 0 && <div className="flex items-center gap-2 py-5 text-xs text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Loading messages…</div>}
                {messages.map((message) => {
                  const mine = message.senderType === "CUSTOMER";
                  const agentName = message.senderName?.trim() || "Support";
                  return <div key={message.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && <div className="mb-1 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                      {message.senderAvatar ? <img src={message.senderAvatar} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : agentName.slice(0, 1).toUpperCase()}
                    </div>}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 ${mine ? "rounded-br-md text-white" : theme ? "rounded-bl-md bg-slate-800" : "rounded-bl-md bg-slate-100 text-slate-900"}`} style={mine ? { backgroundColor: config.settings.primaryColor } : undefined}>
                      {!mine && <p className="mb-1 text-[10px] font-semibold opacity-70">{agentName.split(/\\s+/)[0]}</p>}
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{message.body}</p>
                      <time className={`mt-1 block text-right text-[9px] ${mine ? "text-white/75" : theme ? "text-slate-400" : "text-slate-500"}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  </div>;
                })}
                <div ref={bottomRef} />
              </div>
              {error && <p role="alert" className="mx-3 mb-2 break-words rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error.replaceAll("_", " ").toLowerCase()}</p>}
              <form className={`shrink-0 border-t p-3 ${theme ? "border-slate-800" : "border-slate-200"}`} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
                <div className="flex items-end gap-2">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 2000))} rows={2} maxLength={2000} placeholder={cooldownSecondsLeft > 0 ? `You can send in ${cooldownSecondsLeft}s` : "Write a message…"} className={`max-h-24 min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${fieldClass}`} />
                  <button type="submit" disabled={sending || !draft.trim() || cooldownSecondsLeft > 0} aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-xl text-white disabled:opacity-50" style={{ backgroundColor: config.settings.primaryColor }}>
                    {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-500">{cooldownSecondsLeft > 0 ? `Spam protection: wait ${cooldownSecondsLeft}s` : `One message every ${config.cooldownSeconds}s`}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="size-3" /> Secure chat</span>
                </div>
              </form>
            </>
          )}
          <footer className={`flex shrink-0 items-center justify-center gap-1 border-t px-2 py-2 text-[10px] ${theme ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-400"}`}>
            Powered by Conventus
          </footer>
        </section>
      )}
    </div>
  );
}
