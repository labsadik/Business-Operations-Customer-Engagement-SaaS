"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Edit3, Megaphone, Plus, Search, Trash2, X } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";

type CompanyOption = { id: string; name: string; slug: string };
type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: "LANDING_PAGE" | "ALL_COMPANIES" | "SELECTED_COMPANIES";
  status: "DRAFT" | "PUBLISHED";
  targetCompanies: CompanyOption[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

function audienceLabel(value: Announcement["audience"]) {
  return value === "LANDING_PAGE" ? "Landing page" : value === "ALL_COMPANIES" ? "All company dashboards" : "Selected company dashboards";
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || "REQUEST_FAILED"));
  return body.data as T;
}

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Announcement["audience"]>("LANDING_PAGE");
  const [publish, setPublish] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyOption[]>([]);

  const loadCompanies = useCallback(async function loadCompanies(query = "") {
    try {
      const options = await request<CompanyOption[]>(`/api/admin/companies/options?search=${encodeURIComponent(query)}&limit=25`);
      setCompanies(options);
    } catch {
      setCompanies([]);
    }
  }, []);

  const load = useCallback(async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (audienceFilter) params.set("audience", audienceFilter);
      if (companyFilter) params.set("companyId", companyFilter);
      const body = await request<{ items: Announcement[]; page: number; hasNext: boolean }>(`/api/admin/announcements?${params.toString()}`);
      setItems(body.items);
      setHasNext(body.hasNext);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ANNOUNCEMENT_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, audienceFilter, companyFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCompanies(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCompanies]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCompanies(companySearch); }, 250);
    return () => window.clearTimeout(timer);
  }, [companySearch, loadCompanies]);

  function openCreate() {
    setEditingId("");
    setTitle("");
    setMessage("");
    setAudience("LANDING_PAGE");
    setPublish(false);
    setSelectedCompanies([]);
    setEditorOpen(true);
    setNotice("");
    setError("");
  }

  function openEdit(item: Announcement) {
    setEditingId(item.id);
    setTitle(item.title);
    setMessage(item.message);
    setAudience(item.audience);
    setPublish(item.status === "PUBLISHED");
    setSelectedCompanies(item.targetCompanies);
    setEditorOpen(true);
    setNotice("");
    setError("");
  }

  function toggleCompany(company: CompanyOption) {
    setSelectedCompanies((current) =>
      current.some((item) => item.id === company.id)
        ? current.filter((item) => item.id !== company.id)
        : [...current, company].slice(0, 50)
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (audience === "SELECTED_COMPANIES" && selectedCompanies.length === 0) {
      setError("Select at least one company for targeted dashboards.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/admin/announcements${editingId ? `?id=${encodeURIComponent(editingId)}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          message,
          audience,
          targetCompanyIds: selectedCompanies.map((item) => item.id),
          status: publish ? "PUBLISHED" : "DRAFT"
        })
      });
      setEditorOpen(false);
      setNotice(editingId ? "Announcement saved." : "Announcement created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ANNOUNCEMENT_SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(item: Announcement, next: "DRAFT" | "PUBLISHED") {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/announcements?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next })
      });
      setNotice(next === "PUBLISHED" ? "Announcement published." : "Announcement unpublished.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ANNOUNCEMENT_STATUS_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600"><Megaphone className="size-4" /> Platform announcements</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Announcements</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Publish platform-owned notices to the main landing page, every company dashboard, or only selected companies. Company-owned announcements remain completely separate.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="size-4" />Create announcement</button>
      </section>

      {(error || notice) && (
        <div role={error ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error || notice}
        </div>
      )}

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">Status<select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Audience<select value={audienceFilter} onChange={(e) => { setPage(1); setAudienceFilter(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500"><option value="">All audiences</option><option value="LANDING_PAGE">Landing page</option><option value="ALL_COMPANIES">All company dashboards</option><option value="SELECTED_COMPANIES">Selected company dashboards</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Company target<select value={companyFilter} onChange={(e) => { setPage(1); setCompanyFilter(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500"><option value="">Any company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <article key={item.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.status}</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{audienceLabel(item.audience)}</span>
                    </div>
                    <h2 className="mt-3 text-base font-semibold">{item.title}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.message}</p>
                    {item.targetCompanies.length > 0 && <p className="mt-3 text-xs text-slate-500">Targets: {item.targetCompanies.map((company) => company.name).join(", ")}</p>}
                    <p className="mt-2 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEdit(item)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="size-3.5" />Edit</button>
                    <button type="button" disabled={saving} onClick={() => void setStatus(item, item.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><CheckCircle2 className="size-3.5" />{item.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>
                    <button type="button" onClick={() => setDeleteId(item.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"><Trash2 className="size-3.5" />Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-14 text-center"><Megaphone className="mx-auto size-6 text-slate-300" /><p className="mt-3 text-sm font-semibold">No platform announcements</p><p className="mt-1 text-xs text-slate-500">Create a platform announcement to start communicating with visitors or companies.</p></div>
        )}
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button>
        <span className="text-xs font-semibold text-slate-500">Page {page}</span>
        <button type="button" disabled={!hasNext} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Next</button>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title">
          <form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Conventus platform</p><h2 id="announcement-editor-title" className="mt-1 text-lg font-semibold">{editingId ? "Edit announcement" : "Create announcement"}</h2></div>
              <button type="button" onClick={() => setEditorOpen(false)} className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Close editor"><X className="size-4" /></button>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:px-6">
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-800">{error}</div>}
              <label className="grid gap-2 text-sm font-semibold">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className="rounded-xl border border-slate-300 px-3.5 py-3 font-normal outline-none focus:border-blue-500" /></label>
              <label className="grid gap-2 text-sm font-semibold">Message<textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={5} required className="rounded-xl border border-slate-300 px-3.5 py-3 font-normal outline-none focus:border-blue-500" /><span className="text-[10px] font-normal text-slate-400">{message.length}/500</span></label>
              <fieldset>
                <legend className="text-sm font-semibold">Audience</legend>
                <div className="mt-2 grid gap-2">
                  {([
                    ["LANDING_PAGE", "Main Conventus landing page visitors"],
                    ["ALL_COMPANIES", "All authenticated company dashboards"],
                    ["SELECTED_COMPANIES", "Selected authenticated company dashboards"]
                  ] as const).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5">
                      <input type="radio" name="announcement-audience" value={value} checked={audience === value} onChange={() => { setAudience(value); if (value !== "SELECTED_COMPANIES") setSelectedCompanies([]); }} className="mt-0.5" />
                      <span className="text-xs text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {audience === "SELECTED_COMPANIES" && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <label className="flex items-center gap-2 text-xs font-semibold"><Search className="size-4 text-blue-600" /><span className="sr-only">Search companies</span><input value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Search companies..." className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500" /></label>
                  <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto">
                    {companies.map((company) => {
                      const selected = selectedCompanies.some((item) => item.id === company.id);
                      return <button type="button" key={company.id} onClick={() => toggleCompany(company)} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ${selected ? "border-blue-200 bg-white text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Building2 className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{company.name}</span><span>{selected ? "Selected" : "Select"}</span></button>;
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-slate-500">Selected: {selectedCompanies.length}/50. Empty targeting is rejected by the server.</p>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-xs font-semibold">
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                Publish immediately
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-[#faf9f1] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save changes" : "Create announcement"}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete platform announcement?"
        description="This permanently removes the platform-owned announcement. It does not modify any company-owned announcement."
        confirmLabel="Delete announcement"
        destructive
        busy={saving}
        onCancel={() => { if (!saving) setDeleteId(""); }}
        onConfirm={() => {
          if (saving || !deleteId) return;
          setSaving(true);
          void request(`/api/admin/announcements?id=${encodeURIComponent(deleteId)}`, { method: "DELETE" })
            .then(() => { setDeleteId(""); setNotice("Announcement deleted."); return load(); })
            .catch((e) => setError(e instanceof Error ? e.message : "ANNOUNCEMENT_DELETE_FAILED"))
            .finally(() => setSaving(false));
        }}
      />
    </div>
  );
}
