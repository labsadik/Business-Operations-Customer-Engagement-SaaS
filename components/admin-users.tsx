"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, UserRound } from "lucide-react";
import UserAvatar from "@/components/user-avatar";
import { clientApi } from "@/lib/client-api";
import type { AdminUserListItem } from "@/lib/admin";

type AdminUserPage = { items: AdminUserListItem[]; nextCursor: string | null };

function dateLabel(value: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

export default function AdminUsers({ users, nextCursor: initialCursor }: { users: AdminUserListItem[]; nextCursor: string | null }) {
  const [items, setItems] = useState(users);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestIdRef = useRef(0);
  const searchMountedRef = useRef(false);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!searchMountedRef.current && !query.trim()) {
      searchMountedRef.current = true;
      return;
    }
    searchMountedRef.current = true;
    const timer = window.setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const params = new URLSearchParams({ limit: "5" });
        if (query.trim()) params.set("search", query.trim());
        const page = await clientApi<AdminUserPage>("/api/admin/users?" + params.toString());
        if (requestIdRef.current !== requestId) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      } catch {
        if (requestIdRef.current === requestId) setItems([]);
      } finally {
        if (requestIdRef.current === requestId) setLoadingSearch(false);
      }
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, users, initialCursor]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "5", cursor: nextCursor });
      if (query.trim()) params.set("search", query.trim());
      const page = await clientApi<AdminUserPage>("/api/admin/users?" + params.toString());
      if (requestIdRef.current !== requestId) return;
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !ids.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      // Keep the already-rendered rows available if a page request fails.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Public users</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Scheduling users</h1>
          <p className="mt-2 text-sm text-slate-500">Customers who actually used company scheduling pages and submitted meeting requests.</p>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or company..." aria-label="Search scheduling users" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold">{items.length} scheduling users loaded</p>
            <p className="mt-1 text-[11px] text-slate-500">Five records are loaded at a time to keep this view responsive.</p>
          </div>
          {loadingSearch && <LoaderCircle className="size-4 animate-spin text-blue-600" aria-label="Searching" />}
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((user) => (
            <div key={user.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={user.name} email={user.email} image={user.image} size={40} />
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
              </div>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Companies</p><p className="mt-1 text-xs font-semibold text-slate-700">{user.companies.length ? user.companies.join(", ") : "—"}</p></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-2 py-2.5"><p className="text-base font-semibold">{user.totalRequests}</p><p className="text-[9px] text-slate-400">Requests</p></div>
                <div className="rounded-xl bg-slate-50 px-2 py-2.5"><p className="text-base font-semibold">{user.totalMeetings}</p><p className="text-[9px] text-slate-400">Meetings</p></div>
                <div className="rounded-xl bg-emerald-50 px-2 py-2.5"><p className="text-base font-semibold text-emerald-700">{user.completedMeetings}</p><p className="text-[9px] text-emerald-600">Completed</p></div>
              </div>
              <div className="text-right"><p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Last scheduling</p><p className="mt-1 text-xs font-semibold">{dateLabel(user.lastBookingAt)}</p><p className="mt-1 text-[11px] text-slate-500">Last login {dateLabel(user.lastLoginAt)}</p></div>
            </div>
          ))}
          {!items.length && !loadingSearch && <div className="p-12 text-center"><UserRound className="mx-auto size-5 text-slate-300" /><p className="mt-3 text-sm font-semibold">No scheduling users found</p><p className="mt-1 text-xs text-slate-500">Customer activity will appear here after a booking request is created.</p></div>}
        </div>
        {nextCursor && <div className="border-t border-slate-200 p-4 text-center"><button type="button" onClick={() => void loadMore()} disabled={loadingMore || loadingSearch} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loadingMore ? <LoaderCircle className="size-4 animate-spin" /> : null}{loadingMore ? "Loading 5 more users…" : "Load 5 more users"}</button></div>}
      </section>
    </div>
  );
}
