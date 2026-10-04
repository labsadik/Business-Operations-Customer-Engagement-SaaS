"use client";

import { useMemo, useState } from "react";
import UserAvatar from "@/components/user-avatar";
import {
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound
} from "lucide-react";
import type { AdminAccessUserListItem } from "@/lib/admin";

function dateLabel(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminAccess({
  users,
  currentUserId
}: {
  users: AdminAccessUserListItem[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(users);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.email, item.role, item.companies.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, query]);

  async function setAdmin(userId: string, enabled: boolean) {
    if (busyId) return;
    setBusyId(userId);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/access/users/" + userId, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platformAdmin: enabled })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          body.error === "LAST_PLATFORM_ADMIN"
            ? "At least one active platform admin must remain."
            : body.error === "SELF_ROLE_CHANGE_NOT_ALLOWED"
              ? "You cannot change your own platform admin role."
              : body.error || "ADMIN_ACCESS_UPDATE_FAILED";
        throw new Error(message);
      }

      setItems((current) =>
        current.map((item) =>
          item.id === userId
            ? { ...item, role: body.data.role }
            : item
        )
      );
      setNotice(enabled ? "Platform admin access granted." : "Platform admin access revoked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "ADMIN_ACCESS_UPDATE_FAILED");
    } finally {
      setBusyId(null);
    }
  }

  const admins = items.filter((item) => item.role === "PLATFORM_ADMIN" && item.active).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
              <ShieldCheck className="size-4" />
              Platform access
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Administrator roles</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Platform admins have cross-company operational visibility. The role is stored on the user record,
              validated again when a session is read, and every grant/revoke is audited.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Active admins</p>
              <p className="mt-1 text-xl font-semibold">{admins}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Accounts</p>
              <p className="mt-1 text-xl font-semibold">{items.length}</p>
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"
        >
          {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Database users</p>
            <h2 className="mt-1 text-base font-semibold">Role access control</h2>
            <p className="mt-1 text-xs text-slate-500">Search by account, current role, or company membership.</p>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {visible.map((user) => {
            const isAdmin = user.role === "PLATFORM_ADMIN";
            const canChange = user.id !== currentUserId;
            const busy = busyId === user.id;

            return (
              <article key={user.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={user.name} email={user.email} image={user.image} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      {user.id === currentUserId && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          You
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Current role</p>
                  <span className={[
                    "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold",
                    isAdmin ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                  ].join(" ")}>
                    {isAdmin ? <ShieldCheck className="size-3.5" /> : <UsersRound className="size-3.5" />}
                    {roleLabel(user.role)}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Companies</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-700">
                    {user.companies.length ? user.companies.join(", ") : "No active membership"}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">Last login · {dateLabel(user.lastLoginAt)}</p>
                </div>

                <div className="flex items-center justify-end">
                  {!canChange ? (
                    <span className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-400">
                      Protected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setAdmin(user.id, !isAdmin)}
                      disabled={busy}
                      className={[
                        "inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition",
                        isAdmin
                          ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "bg-slate-950 text-white hover:bg-slate-800",
                        "disabled:cursor-not-allowed disabled:opacity-50"
                      ].join(" ")}
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : isAdmin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                      {busy ? "Saving..." : isAdmin ? "Revoke admin" : "Grant admin"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {!visible.length && (
            <div className="p-12 text-center">
              <CheckCircle2 className="mx-auto size-5 text-slate-300" />
              <p className="mt-3 text-sm font-semibold">No matching accounts</p>
              <p className="mt-1 text-xs text-slate-500">Try another name, email, role, or company.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
