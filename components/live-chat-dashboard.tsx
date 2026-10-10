"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageCircle, Settings2, Download, Trash2, Send, RefreshCw, Copy, CheckCircle2,
  Check, LoaderCircle, Palette, ShieldCheck, UsersRound, MessageSquareText,
  Clock3, AlertCircle, Code2
} from "lucide-react";

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string; details?: unknown };
type Conversation = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: "OPEN" | "CLOSED";
  messageCount: number;
  lastMessageAt: string;
  nextCustomerMessageAt: string | null;
  expiresAt: string;
  createdAt: string;
};
type ChatMessage = { id: string; senderType: "CUSTOMER" | "AGENT"; senderUserId?: string | null; body: string; createdAt: string };
type Usage = {
  monthlyChats: number;
  uniqueCustomers: number;
  openChats: number;
  monthlyChatLimit: number;
  customerLimit: number;
  agentLimit: number;
  retentionDays: number;
  cooldownSeconds: number;
  pdfExportEnabled: boolean;
  deleteEnabled: boolean;
};
type ChatSettings = {
  publicWidgetEnabled: boolean;
  title: string;
  welcomeMessage: string;
  primaryColor: string;
  theme: "LIGHT" | "DARK";
  position: "LEFT" | "RIGHT";
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowedDomains: string[];
};
type SettingsPayload = {
  settings: ChatSettings;
  companyWebsiteUrl: string;
  embedCode: string;
  limits: { retentionDays: number; messageCooldownSeconds: number; monthlyChatLimit: number; customerLimit: number };
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (response.headers.get("content-type")?.includes("application/pdf") && response.ok) return await response.blob() as T;
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || !body.ok || body.data === undefined) {
    const error = new Error(body.error ?? "REQUEST_FAILED") as Error & { code?: string };
    error.code = body.error;
    throw error;
  }
  return body.data;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function inputClass() {
  return "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>}</span>
  </label>;
}

export default function LiveChatDashboard({ canManageSettings = true }: { canManageSettings?: boolean }) {
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");
  const [items, setItems] = useState<Conversation[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [embedCode, setEmbedCode] = useState("");
  const [companyWebsiteUrl, setCompanyWebsiteUrl] = useState("");
  const [domainsText, setDomainsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const loadInbox = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const data = await api<{ items: Conversation[]; usage: Usage }>("/api/live-chat");
      setItems(data.items);
      setUsage(data.usage);
      setError("");
      setSelectedId((current) => current && data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? "");
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api<SettingsPayload>("/api/live-chat/settings");
      setSettings(data.settings);
      setEmbedCode(data.embedCode);
      setCompanyWebsiteUrl(data.companyWebsiteUrl);
      setDomainsText(data.settings.allowedDomains.join("\n"));
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    try {
      const data = await api<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/live-chat/conversations/${encodeURIComponent(conversationId)}/messages`);
      setMessages(data.messages);
      setItems((current) => current.map((item) => item.id === conversationId ? { ...item, ...data.conversation, messageCount: Math.max(item.messageCount, data.messages.length) } : item));
    } catch (cause) {
      if (!quiet) setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
    void loadSettings();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadInbox(true);
        if (selectedId && tab === "inbox") void loadMessages(selectedId, true);
      }
    }, 3000);
    const visible = () => {
      if (document.visibilityState === "visible") {
        void loadInbox(true);
        if (selectedId && tab === "inbox") void loadMessages(selectedId, true);
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [loadInbox, loadSettings, loadMessages, selectedId, tab]);

  useEffect(() => {
    setMessages([]);
    if (selectedId && tab === "inbox") void loadMessages(selectedId);
  }, [selectedId, tab, loadMessages]);

  const saveSettings = async () => {
    if (!settings || savingSettings) return;
    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const data = await api<{ settings: ChatSettings }>("/api/live-chat/settings", {
        method: "PATCH",
        body: JSON.stringify({ ...settings, allowedDomains: domainsText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean) })
      });
      setSettings(data.settings);
      setDomainsText(data.settings.allowedDomains.join("\n"));
      await loadSettings();
      setNotice("Live Chat settings saved.");
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || body.length > 2000 || !selectedId || sending) return;
    setSending(true);
    setError("");
    try {
      await api<{ message: ChatMessage }>(`/api/live-chat/conversations/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST", body: JSON.stringify({ body })
      });
      setReply("");
      await Promise.all([loadMessages(selectedId, true), loadInbox(true)]);
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    } finally {
      setSending(false);
    }
  };

  const closeConversation = async (item: Conversation) => {
    if (item.status !== "OPEN") return;
    try {
      await api<{ id: string; status: "CLOSED" }>(`/api/live-chat/conversations/${encodeURIComponent(item.id)}`, {
        method: "PATCH", body: JSON.stringify({ action: "close" })
      });
      setNotice("Conversation closed. It remains in your history until retention expires.");
      await Promise.all([loadInbox(true), loadMessages(item.id, true)]);
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    }
  };

  const deleteConversation = async (item: Conversation) => {
    if (!usage?.deleteEnabled || !window.confirm(`Permanently delete the chat with ${item.customerName}? The conversation and its messages will be removed.`)) return;
    try {
      await api<{ deleted: boolean }>(`/api/live-chat/conversations/${encodeURIComponent(item.id)}`, { method: "DELETE", body: JSON.stringify({}) });
      setNotice("Chat permanently deleted.");
      setMessages([]);
      setSelectedId("");
      await loadInbox(true);
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    }
  };

  const exportConversation = async (item: Conversation) => {
    try {
      const blob = await api<Blob>(`/api/live-chat/conversations/${encodeURIComponent(item.id)}/export`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `conventus-chat-${item.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error & { code?: string }).code ?? (cause as Error).message);
    }
  };

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("CLIPBOARD_PERMISSION_DENIED");
    }
  };

  if (loading) return <div className="grid min-h-[420px] place-items-center rounded-3xl border border-slate-200 bg-white"><LoaderCircle className="size-6 animate-spin text-blue-600" /></div>;
  if ((error === "LIVE_CHAT_NOT_INCLUDED" || error === "FORBIDDEN") && !usage) {
    return <div className="rounded-3xl border border-amber-200 bg-white p-8"><AlertCircle className="size-6 text-amber-600" /><h2 className="mt-3 text-lg font-semibold text-slate-900">Live Chat is not available</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Your current plan may not include Live Chat, or your account cannot access this workspace. A platform administrator can enable the feature in Admin → Plans.</p><a href="/dashboard" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Back to workspace</a></div>;
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
      <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700"><MessageCircle className="size-3.5" /> Website messaging</div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Live Chat</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Manage website conversations, customize the visitor widget, and control retention.</p></div>
      <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button onClick={() => setTab("inbox")} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === "inbox" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><MessageSquareText className="size-4" /> Inbox</button>
        <button onClick={() => canManageSettings && setTab("settings")} disabled={!canManageSettings} title={!canManageSettings ? "Only a company admin can change widget settings" : undefined} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${tab === "settings" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><Settings2 className="size-4" /> Settings</button>
      </div>
    </div>

    {(error || notice) && <div role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}<span className="min-w-0 flex-1 break-words">{(error || notice).replaceAll("_", " ").toLowerCase()}</span>{error && <button onClick={() => setError("")} className="text-xs font-semibold underline">Dismiss</button>}</div>}

    {usage && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Chats this month", value: `${usage.monthlyChats.toLocaleString("en-IN")} / ${usage.monthlyChatLimit.toLocaleString("en-IN")}`, icon: MessageCircle },
        { label: "Unique customers", value: `${usage.uniqueCustomers.toLocaleString("en-IN")} / ${usage.customerLimit.toLocaleString("en-IN")}`, icon: UsersRound },
        { label: "Open conversations", value: usage.openChats.toLocaleString("en-IN"), icon: MessageSquareText },
        { label: "Auto-delete history", value: `${usage.retentionDays} days`, icon: Clock3 }
      ].map((card) => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{card.label}</span><card.icon className="size-4 text-slate-400" /></div><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{card.value}</p></div>)}
    </div>}

    {tab === "inbox" ? <div className="grid min-h-[580px] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${selectedId ? "hidden lg:block" : ""}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Conversations</h2><p className="mt-1 text-xs text-slate-500">Newest activity first</p></div><button onClick={() => void loadInbox()} disabled={refreshing} aria-label="Refresh conversations" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /></button></div>
        <div className="max-h-[660px] divide-y divide-slate-100 overflow-y-auto">
          {items.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`block w-full px-4 py-4 text-left transition ${selectedId === item.id ? "bg-blue-50/70" : "hover:bg-slate-50"}`}>
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{item.customerName.slice(0,1).toUpperCase() || "A"}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900">{item.customerName || "Anonymous customer"}</span><span className="shrink-0 text-[10px] text-slate-400">{new Date(item.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{item.customerEmail || item.customerPhone || "Anonymous visitor"}</span><span className="mt-2 flex items-center gap-2 text-[10px] text-slate-500"><MessageCircle className="size-3" /> {item.messageCount} messages <span>·</span> Expires {new Date(item.expiresAt).toLocaleDateString()}</span></span></div>
          </button>)}
          {items.length === 0 && <div className="px-5 py-12 text-center"><MessageCircle className="mx-auto size-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-800">No chats yet</p><p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-slate-500">Enable the widget in Settings and add the embed code to your website.</p>{canManageSettings && <button onClick={() => setTab("settings")} className="mt-4 text-xs font-semibold text-blue-700">Configure widget →</button>}</div>}
        </div>
      </section>

      <section className={`flex min-h-[580px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${!selectedId ? "hidden lg:flex" : ""}`}>
        {selected ? <>
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5"><button onClick={() => setSelectedId("")} className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden" aria-label="Back to conversations"><MessageCircle className="size-4" /></button><span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{selected.customerName.slice(0,1).toUpperCase() || "A"}</span><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-slate-900">{selected.customerName}</h2><p className="truncate text-xs text-slate-500">{selected.customerEmail || selected.customerPhone || "Anonymous customer"}</p></div><div className="flex items-center gap-1.5">
            {selected.status === "OPEN" && <button onClick={() => void closeConversation(selected)} title="Close conversation" aria-label="Close conversation" className="rounded-xl border border-emerald-200 p-2.5 text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="size-4" /></button>}
            {usage?.pdfExportEnabled && <button onClick={() => void exportConversation(selected)} title="Export formatted PDF" aria-label="Export chat as PDF" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><Download className="size-4" /></button>}
            {usage?.deleteEnabled && <button onClick={() => void deleteConversation(selected)} title="Permanently delete chat" aria-label="Delete chat" className="rounded-xl border border-rose-200 p-2.5 text-rose-600 hover:bg-rose-50"><Trash2 className="size-4" /></button>}
          </div></div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfd] px-4 py-5 sm:px-6">
            <p className="mx-auto mb-4 w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500">Conversation started {formatDate(selected.createdAt)}</p>
            {messages.map((message) => <div key={message.id} className={`flex ${message.senderType === "AGENT" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${message.senderType === "AGENT" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}><p className="mb-1.5 text-[10px] font-semibold opacity-70">{message.senderType === "AGENT" ? "Your team" : selected.customerName || "Customer"}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p><time className="mt-1.5 block text-right text-[9px] opacity-60">{formatDate(message.createdAt)}</time></div></div>)}
            {messages.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No messages to display.</p>}
          </div>
          {selected.status === "CLOSED" ? <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 text-center text-xs text-slate-500">This conversation is closed. It remains available in history until the retention period expires.</div> : <form className="border-t border-slate-100 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
            <div className="flex items-end gap-2"><textarea rows={2} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to this customer…" className="max-h-28 min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><button disabled={sending || !reply.trim()} type="submit" className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50" aria-label="Send reply">{sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</button></div>
            <p className="mt-2 text-[10px] text-slate-400">Visitor messages are subject to the server-enforced {usage?.cooldownSeconds ?? 15}-second cooldown.</p>
          </form>}
        </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto size-8 text-slate-300" /><h2 className="mt-3 text-sm font-semibold text-slate-800">Select a conversation</h2><p className="mt-1 text-xs text-slate-500">Choose a customer from the inbox to view and reply.</p></div></div>}
      </section>
    </div> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {settings && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6"><div className="flex items-center gap-2"><Palette className="size-4 text-blue-600" /><h2 className="text-base font-semibold text-slate-950">Widget appearance</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">Changes are scoped to this company and applied to new widget loads.</p></div>
        <div className="space-y-5">
          <SettingToggle label="Enable public website widget" description="The embedded chat becomes available after you save allowed website domains." checked={settings.publicWidgetEnabled} onChange={(value) => setSettings({ ...settings, publicWidgetEnabled: value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">Widget title<input value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} maxLength={80} className={inputClass()} /></label>
            <label className="block text-xs font-semibold text-slate-700">Welcome message<input value={settings.welcomeMessage} onChange={(event) => setSettings({ ...settings, welcomeMessage: event.target.value })} maxLength={300} className={inputClass()} /></label>
            <label className="block text-xs font-semibold text-slate-700">Brand color<div className="mt-1.5 flex gap-2"><input type="color" value={settings.primaryColor} onChange={(event) => setSettings({ ...settings, primaryColor: event.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 p-1" /><input value={settings.primaryColor} onChange={(event) => setSettings({ ...settings, primaryColor: event.target.value })} pattern="^#[0-9a-fA-F]{6}$" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm uppercase outline-none focus:border-blue-500" /></div></label>
            <label className="block text-xs font-semibold text-slate-700">Theme<select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value as ChatSettings["theme"] })} className={inputClass()}><option value="LIGHT">Light</option><option value="DARK">Dark</option></select></label>
            <label className="block text-xs font-semibold text-slate-700">Widget position<select value={settings.position} onChange={(event) => setSettings({ ...settings, position: event.target.value as ChatSettings["position"] })} className={inputClass()}><option value="RIGHT">Bottom right</option><option value="LEFT">Bottom left</option></select></label>
          </div>
        </div>
        <div className="mb-5 mt-7 border-t border-slate-100 pt-5"><div className="flex items-center gap-2"><UsersRound className="size-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900">Contact collection</h3></div><p className="mt-1 text-xs leading-5 text-slate-500">When enabled, visitors must complete the selected fields before starting a conversation. All three disabled means anonymous chat is allowed.</p><div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SettingToggle label="Require name" checked={settings.collectName} onChange={(value) => setSettings({ ...settings, collectName: value })} />
          <SettingToggle label="Require email" checked={settings.collectEmail} onChange={(value) => setSettings({ ...settings, collectEmail: value })} />
          <SettingToggle label="Require phone" checked={settings.collectPhone} onChange={(value) => setSettings({ ...settings, collectPhone: value })} />
        </div></div>
        <div className="border-t border-slate-100 pt-5"><label className="block text-xs font-semibold text-slate-700">Allowed website domains<textarea value={domainsText} onChange={(event) => setDomainsText(event.target.value)} rows={3} placeholder={companyWebsiteUrl || "www.example.com"} className={inputClass()} /></label><p className="mt-2 text-[11px] leading-5 text-slate-500">Enter exact hostnames, one per line. Example: example.com and help.example.com. Requests from other websites are blocked by the server.</p></div>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[11px] leading-5 text-slate-500">Server-enforced: {usage?.cooldownSeconds ?? 15}s cooldown · {usage?.retentionDays ?? 30}-day data retention</span><button onClick={() => void saveSettings()} disabled={!canManageSettings || savingSettings} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{savingSettings ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save settings</button></div>
      </section>}
      <aside className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Code2 className="size-4 text-blue-600" /><h2 className="text-sm font-semibold text-slate-900">Website embed code</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Add this single script to your website before the closing body tag. It loads a small isolated iframe and only polls while the widget is visible.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-blue-100">{embedCode || "Save settings to generate embed code."}</pre><button onClick={() => void copyEmbed()} disabled={!embedCode} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy embed code"}</button></section>
        <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-blue-700" /><h2 className="text-sm font-semibold text-slate-900">Security & performance</h2></div><div className="mt-3 space-y-3 text-xs leading-5 text-slate-600"><p><strong className="text-slate-800">Spam protection stays on.</strong> The server atomically enforces message cooldowns, validates text, and limits rapid conversation creation.</p><p><strong className="text-slate-800">Tenant isolated.</strong> Every inbox/message query is scoped to your company and workspace. Agent roles and feature entitlements are checked on the server.</p><p><strong className="text-slate-800">Auto deletion.</strong> Chat messages expire individually; the daily retention job removes expired conversations in batches.</p><p><strong className="text-slate-800">Plan limits.</strong> {usage?.monthlyChats ?? 0} / {usage?.monthlyChatLimit ?? 0} monthly chats and {usage?.uniqueCustomers ?? 0} / {usage?.customerLimit ?? 0} unique visitors used.</p></div></section>
      </aside>
    </div>}
  </div>;
}
