"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BadgeCheck,
  Check,
  CircleAlert,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Tag
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";

type Status = "PUBLIC" | "COMING_SOON" | "PRIVATE";
type DiscountType = "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";

type Plan = {
  id: string;
  name: string;
  description: string;
  status: Status;
  popular: boolean;
  recommended: boolean;
  priceInr: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmountInr: number;
  finalPriceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
  taskManagementEnabled: boolean;
  taskManagementDailyLimit: number | null;
  vaultEnabled: boolean;
  vaultQuotaBytes: number;
  vaultMaxFileBytes: number;
  vaultMaxItems: number;
  validityDays: number;
  freeFeatureDays: number | null;
  requiresPayment: boolean;
  revision: number;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activeSubscriptionCount: number;
  paymentCount: number;
  invoiceCount: number;
};

type Draft = {
  identifier: string;
  name: string;
  description: string;
  status: Status;
  popular: boolean;
  recommended: boolean;
  priceInr: string;
  discountType: DiscountType;
  discountValue: string;
  maxWorkspaces: string;
  maxCompanies: string;
  maxEmployees: string;
  monthlyMeetingLimit: string;
  maxMeetingDurationMinutes: string;
  maxConcurrentMeetings: string;
  taskManagementEnabled: boolean;
  taskManagementDailyLimit: string;
  taskManagementUnlimitedDaily: boolean;
  vaultEnabled: boolean;
  vaultQuotaAmount: string;
  vaultQuotaUnit: "GB" | "TB";
  vaultMaxFileMiB: string;
  vaultMaxItems: string;
  validityDays: string;
  freeFeatureDays: string;
};

const emptyDraft: Draft = {
  identifier: "",
  name: "",
  description: "",
  status: "PRIVATE",
  popular: false,
  recommended: false,
  priceInr: "0",
  discountType: "NONE",
  discountValue: "0",
  maxWorkspaces: "1",
  maxCompanies: "1",
  maxEmployees: "1",
  monthlyMeetingLimit: "1",
  maxMeetingDurationMinutes: "30",
  maxConcurrentMeetings: "1",
  taskManagementEnabled: false,
  taskManagementDailyLimit: "10",
  taskManagementUnlimitedDaily: false,
  vaultEnabled: false,
  vaultQuotaAmount: "5",
  vaultQuotaUnit: "GB",
  vaultMaxFileMiB: "100",
  vaultMaxItems: "1000",
  validityDays: "30",
  freeFeatureDays: ""
};

function storageLimitLabel(bytes: number) {
  const units = [
    { size: 1024 ** 4, label: "TB" },
    { size: 1024 ** 3, label: "GB" },
    { size: 1024 ** 2, label: "MiB" },
    { size: 1024, label: "KiB" }
  ];
  const unit = units.find((candidate) => bytes >= candidate.size) ?? { size: 1, label: "B" };
  const value = bytes / unit.size;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + " " + unit.label;
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function toDraft(plan: Plan): Draft {
  return {
    identifier: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    popular: plan.popular,
    recommended: plan.recommended,
    priceInr: String(plan.priceInr),
    discountType: plan.discountType,
    discountValue: String(plan.discountValue),
    maxWorkspaces: String(plan.maxWorkspaces),
    maxCompanies: String(plan.maxCompanies),
    maxEmployees: String(plan.maxEmployees),
    monthlyMeetingLimit: String(plan.monthlyMeetingLimit),
    maxMeetingDurationMinutes: String(plan.maxMeetingDurationMinutes),
    maxConcurrentMeetings: String(plan.maxConcurrentMeetings),
    taskManagementEnabled: Boolean(plan.taskManagementEnabled),
    taskManagementDailyLimit: String(plan.taskManagementDailyLimit ?? 10),
    taskManagementUnlimitedDaily: plan.taskManagementDailyLimit === null,
    vaultEnabled: Boolean(plan.vaultEnabled),
    vaultQuotaAmount: String((plan.vaultQuotaBytes ?? 5368709120) >= 1024 ** 4
      ? (plan.vaultQuotaBytes ?? 5368709120) / (1024 ** 4)
      : (plan.vaultQuotaBytes ?? 5368709120) / (1024 ** 3)),
    vaultQuotaUnit: (plan.vaultQuotaBytes ?? 5368709120) >= 1024 ** 4 ? "TB" : "GB",
    vaultMaxFileMiB: String((plan.vaultMaxFileBytes ?? 104857600) / (1024 ** 2)),
    vaultMaxItems: String(plan.vaultMaxItems ?? 1000),
    validityDays: String(plan.validityDays),
    freeFeatureDays: plan.freeFeatureDays == null ? "" : String(plan.freeFeatureDays)
  };
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function draftPayload(draft: Draft) {
  return {
    identifier: draft.identifier,
    name: draft.name,
    description: draft.description,
    status: draft.status,
    popular: draft.popular,
    recommended: draft.recommended,
    priceInr: parseNumber(draft.priceInr),
    discountType: draft.discountType,
    discountValue: parseNumber(draft.discountValue),
    maxWorkspaces: parseNumber(draft.maxWorkspaces),
    maxCompanies: parseNumber(draft.maxCompanies),
    maxEmployees: parseNumber(draft.maxEmployees),
    monthlyMeetingLimit: parseNumber(draft.monthlyMeetingLimit),
    maxMeetingDurationMinutes: parseNumber(draft.maxMeetingDurationMinutes),
    maxConcurrentMeetings: parseNumber(draft.maxConcurrentMeetings),
    taskManagementEnabled: draft.taskManagementEnabled,
    taskManagementDailyLimit: draft.taskManagementUnlimitedDaily ? null : parseNumber(draft.taskManagementDailyLimit),
    vaultEnabled: draft.vaultEnabled,
    vaultQuotaBytes: Math.round(parseNumber(draft.vaultQuotaAmount) * (draft.vaultQuotaUnit === "TB" ? 1024 ** 4 : 1024 ** 3)),
    vaultMaxFileBytes: Math.round(parseNumber(draft.vaultMaxFileMiB) * (1024 ** 2)),
    vaultMaxItems: parseNumber(draft.vaultMaxItems),
    validityDays: parseNumber(draft.validityDays),
    freeFeatureDays: draft.freeFeatureDays.trim() === "" ? null : parseNumber(draft.freeFeatureDays)
  };
}

function pricingPreview(draft: Draft) {
  const price = Math.max(0, parseNumber(draft.priceInr) || 0);
  const discount = Math.max(0, parseNumber(draft.discountValue) || 0);
  let discountAmount = 0;
  if (draft.discountType === "PERCENTAGE") {
    discountAmount = price * Math.min(100, discount) / 100;
  } else if (draft.discountType === "FIXED_AMOUNT") {
    discountAmount = Math.min(price, discount);
  }
  return {
    base: price,
    discount: discountAmount,
    final: Math.max(0, price - discountAmount)
  };
}

function statusLabel(status: Status) {
  return status === "PUBLIC"
    ? "Public"
    : status === "COMING_SOON"
      ? "Coming soon"
      : "Private";
}

function validPlanItems(value: unknown): Plan[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Plan => {
    if (!item || typeof item !== "object") return false;
    const id = (item as { id?: unknown }).id;
    return typeof id === "string" && id.trim().length > 0 && id !== "undefined";
  });
}

export default function AdminPlans() {
  const [items, setItems] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status | "ARCHIVED">("ALL");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    action: () => void;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/plans", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_LIST_FAILED");
      setItems(validPlanItems(body.data?.items));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PLAN_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialPlans() {
      try {
        const response = await fetch("/api/admin/plans", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "PLAN_LIST_FAILED");
        if (cancelled) return;
        setItems(validPlanItems(body.data?.items));
        setError("");
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "PLAN_LIST_FAILED");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchInitialPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.id.includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "ARCHIVED"
            ? Boolean(item.archivedAt)
            : !item.archivedAt && item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  const preview = pricingPreview(draft);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setOriginal(null);
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(item: Plan) {
    setEditingId(item.id);
    const next = toDraft(item);
    setDraft(next);
    setOriginal(next);
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function hasRiskyEdit(item: Plan, nextDraft: Draft) {
    if (item.activeSubscriptionCount === 0) return false;
    if (!original) return false;
    return [
      "status",
      "priceInr",
      "discountType",
      "discountValue",
      "maxWorkspaces",
      "maxCompanies",
      "maxEmployees",
      "monthlyMeetingLimit",
      "maxMeetingDurationMinutes",
      "maxConcurrentMeetings",
      "taskManagementEnabled",
      "taskManagementDailyLimit",
      "taskManagementUnlimitedDaily",
      "vaultEnabled",
      "vaultQuotaAmount",
      "vaultQuotaUnit",
      "vaultMaxFileMiB",
      "vaultMaxItems",
      "validityDays",
      "freeFeatureDays"
    ].some((key) => nextDraft[key as keyof Draft] !== original[key as keyof Draft]);
  }

  async function submitSave() {
    if (saving) return;
    if (editingId === "undefined") {
      setError("PLAN_IDENTIFIER_INVALID");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = draftPayload(draft);
      const url = editingId
        ? "/api/admin/plans/" + encodeURIComponent(editingId)
        : "/api/admin/plans";
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_SAVE_FAILED");
      setEditorOpen(false);
      setNotice(editingId ? "Plan changes saved." : "Plan created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PLAN_SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (saving) return;
    const current = editingId ? items.find((item) => item.id === editingId) : null;
    if (current && hasRiskyEdit(current, draft)) {
      setConfirmation({
        title: "Change a plan used by active companies?",
        description:
          "Current subscriptions use their stored entitlement snapshot, so this edit applies to new purchases/renewals. Historical invoices and captured payments are not rewritten. The change will be audited.",
        confirmLabel: "Save plan changes",
        action: () => {
          setConfirmation(null);
          void submitSave();
        }
      });
      return;
    }
    void submitSave();
  }

  async function patchPlan(id: string, payload: Record<string, unknown>, success: string) {
    if (saving) return;
    if (!id || id === "undefined") {
      setError("PLAN_IDENTIFIER_INVALID");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/plans/" + encodeURIComponent(id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_UPDATE_FAILED");
      setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PLAN_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  function requestStatusChange(item: Plan, status: Status) {
    const label = statusLabel(status).toLowerCase();
    if (item.status === status && !item.archivedAt) return;
    if (status !== "PUBLIC" && item.status === "PUBLIC" && item.activeSubscriptionCount > 0) {
      setConfirmation({
        title: "Change public availability?",
        description:
          "New customer purchases will stop immediately once the server sees this status. Existing subscribers are not cancelled and keep their stored entitlement snapshot.",
        confirmLabel: "Set " + label,
        action: () => {
          setConfirmation(null);
          void patchPlan(item.id, { status }, "Plan status updated.");
        }
      });
      return;
    }
    void patchPlan(item.id, { status }, "Plan status updated.");
  }

  function requestArchive(item: Plan, archived: boolean) {
    setConfirmation({
      title: archived ? "Archive this plan?" : "Restore this plan?",
      description: archived
        ? "Archived plans are unavailable for public pricing and new checkout. Existing subscriptions, payments, and invoices remain intact."
        : "Restoring a plan makes its saved status active again. Review the status before publishing it.",
      confirmLabel: archived ? "Archive plan" : "Restore plan",
      destructive: archived,
      action: () => {
        setConfirmation(null);
        void patchPlan(item.id, { archived }, archived ? "Plan archived." : "Plan restored.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">
              <Tag className="size-4" />
              Plan catalog
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Plans</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Manage stable billing identifiers, public visibility, pricing, discounts, labels, and the existing Conventus entitlement units. Current subscribers keep their stored entitlements when a catalog plan changes.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="size-4" />
            Create plan
          </button>
        </div>
      </section>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={
            "rounded-2xl border px-4 py-3 text-sm " +
            (error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800")
          }
        >
          {error || notice}
        </div>
      )}

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_190px_auto]">
        <label className="text-xs font-semibold text-slate-700">
          Search plans
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or identifier"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="ALL">All plans</option>
            <option value="PUBLIC">Public</option>
            <option value="COMING_SOON">Coming soon</option>
            <option value="PRIVATE">Private</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <div className="flex items-end text-xs text-slate-400">
          {filtered.length} of {items.length} plan{items.length === 1 ? "" : "s"}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-3xl bg-slate-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="xl:col-span-2 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Tag className="mx-auto size-6 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No matching plans</p>
            <p className="mt-1 text-xs text-slate-400">Create a plan or adjust the search/filter.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const archived = Boolean(item.archivedAt);
            return (
              <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">{item.name}</h2>
                        {item.popular && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                            <Sparkles className="size-3" />
                            Popular
                          </span>
                        )}
                        {item.recommended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                            <BadgeCheck className="size-3" />
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{item.id}</p>
                      {item.description && <p className="mt-3 text-xs leading-5 text-slate-500">{item.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold " +
                      (item.status === "PUBLIC"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.status === "COMING_SOON"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600")
                    }>
                      {statusLabel(item.status)}
                    </span>
                    {archived && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
                        <Archive className="size-3" />
                        Archived
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                      Revision {item.revision}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-2xl bg-slate-950 p-4 text-white sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Base price</p>
                      <p className="mt-1 text-xl font-semibold">{money(item.priceInr)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Discount</p>
                      <p className="mt-1 text-sm font-semibold">
                        {item.discountType === "NONE"
                          ? "None"
                          : item.discountType === "PERCENTAGE"
                            ? item.discountValue + "%"
                            : money(item.discountValue)}
                      </p>
                      <p className="mt-1 text-[10px] text-white/45">
                        {item.discountAmountInr > 0 ? money(item.discountAmountInr) + " off" : "No reduction"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Final plan price</p>
                      <p className="mt-1 text-xl font-semibold">{money(item.finalPriceInr)}</p>
                      <p className="mt-1 text-[10px] text-white/45">before GST at checkout</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Employees", item.maxEmployees],
                      ["Meetings / month", item.monthlyMeetingLimit],
                      ["Max duration", item.maxMeetingDurationMinutes + " min"],
                      ["Concurrent", item.maxConcurrentMeetings],
                      ["Validity", item.validityDays + " days"],
                      ["Free feature window", item.freeFeatureDays == null ? "Not configured" : item.freeFeatureDays + " days"]
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                        <p className="text-[10px] uppercase tracking-[0.11em] text-slate-400">{label}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-slate-400">Task management</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">
                      {item.taskManagementEnabled
                        ? item.taskManagementDailyLimit === null
                          ? "Included · Unlimited tasks/day"
                          : "Included · " + item.taskManagementDailyLimit + " tasks/day"
                        : "Not included"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-slate-400">Cloud vault</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">
                      {item.vaultEnabled
                        ? "Included · " + storageLimitLabel(item.vaultQuotaBytes) + " · " + storageLimitLabel(item.vaultMaxFileBytes) + "/file · " + item.vaultMaxItems.toLocaleString("en-IN") + " files"
                        : "Not included"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                    <span className="rounded-full border border-slate-200 px-2.5 py-1">{item.activeSubscriptionCount} active subscriptions</span>
                    <span className="rounded-full border border-slate-200 px-2.5 py-1">{item.paymentCount} payment records</span>
                    <span className="rounded-full border border-slate-200 px-2.5 py-1">{item.invoiceCount} invoices</span>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    {!archived && item.status !== "PUBLIC" && (
                      <button
                        type="button"
                        onClick={() => requestStatusChange(item, "PUBLIC")}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        <Rocket className="size-3.5" />
                        Publish
                      </button>
                    )}
                    {!archived && item.status !== "COMING_SOON" && (
                      <button
                        type="button"
                        onClick={() => requestStatusChange(item, "COMING_SOON")}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 disabled:opacity-50"
                      >
                        <CircleAlert className="size-3.5" />
                        Coming soon
                      </button>
                    )}
                    {!archived && item.status !== "PRIVATE" && (
                      <button
                        type="button"
                        onClick={() => requestStatusChange(item, "PRIVATE")}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <EyeOff className="size-3.5" />
                        Make private
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => requestArchive(item, !archived)}
                      disabled={saving}
                      className={
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold disabled:opacity-50 " +
                        (archived
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700")
                      }
                    >
                      {archived ? <Check className="size-3.5" /> : <Archive className="size-3.5" />}
                      {archived ? "Restore" : "Archive"}
                    </button>
                  </div>

                  <div className="flex items-start gap-2 text-[10px] leading-4 text-slate-400">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    Tags are labels only. Stable identifier is immutable. Historical invoices/payments are not rewritten by plan edits.
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 sm:p-6">
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">
                      {editingId ? "Edit plan" : "Create plan"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {editingId ? "Update catalog configuration" : "Add a new billing plan"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Identifier is the stable database/billing identity and cannot be renamed after creation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1fr]">
                <section className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Display & visibility</p>
                    <p className="mt-1 text-[11px] text-slate-500">Public controls customer visibility/purchase eligibility; it never bypasses authentication, payment, or company rules.</p>
                  </div>
                  <Field label="Stable identifier" value={draft.identifier} disabled={Boolean(editingId)} onChange={(value) => setDraft((current) => ({ ...current, identifier: value }))} />
                  <Field label="Plan name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Description</span>
                    <textarea
                      value={draft.description}
                      onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                      rows={4}
                      maxLength={1200}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-700">Status</span>
                      <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Status }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500">
                        <option value="PUBLIC">PUBLIC · visible & purchasable</option>
                        <option value="COMING_SOON">COMING_SOON · visible, disabled</option>
                        <option value="PRIVATE">PRIVATE · hidden from customers</option>
                      </select>
                    </label>
                    <div className="space-y-2">
                      <Toggle label="Popular tag" value={draft.popular} onChange={(value) => setDraft((current) => ({ ...current, popular: value }))} />
                      <Toggle label="Recommended tag" value={draft.recommended} onChange={(value) => setDraft((current) => ({ ...current, recommended: value }))} />
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Price & discount</p>
                    <p className="mt-1 text-[11px] text-slate-500">Amount is INR in the application’s billing units. Discount is calculated from the base price and validated on the server.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Base price (INR)" type="number" min="0" step="0.01" value={draft.priceInr} onChange={(value) => setDraft((current) => ({ ...current, priceInr: value }))} />
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-700">Discount type</span>
                      <select value={draft.discountType} onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as DiscountType }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500">
                        <option value="NONE">No discount</option>
                        <option value="PERCENTAGE">Percentage</option>
                        <option value="FIXED_AMOUNT">Fixed amount</option>
                      </select>
                    </label>
                  </div>
                  <Field label="Discount value" type="number" min="0" step="0.01" value={draft.discountValue} onChange={(value) => setDraft((current) => ({ ...current, discountValue: value }))} />
                  <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:grid-cols-3">
                    <Summary label="Base" value={money(preview.base)} />
                    <Summary label="Discount" value={"−" + money(preview.discount)} />
                    <Summary label="Final" value={money(preview.final)} />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-5 text-slate-600">
                    <p className="font-semibold text-slate-900">Checkout rule</p>
                    <p className="mt-1">The server recalculates the discounted amount and GST before creating the Razorpay order. The browser never supplies the authoritative amount.</p>
                  </div>
                </section>

                <section className="space-y-5 lg:col-span-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Existing entitlement units</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      These fields keep their existing application meaning: employees = active company members, meetings/month = booking usage limit, duration = maximum meeting length, concurrent = simultaneous company bookings, validity = subscription period. Blank free-feature days means no separate free-feature window.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Workspaces" type="number" min="1" step="1" value={draft.maxWorkspaces} onChange={(value) => setDraft((current) => ({ ...current, maxWorkspaces: value }))} />
                    <Field label="Companies" type="number" min="1" step="1" value={draft.maxCompanies} onChange={(value) => setDraft((current) => ({ ...current, maxCompanies: value }))} />
                    <Field label="Employees" type="number" min="1" step="1" value={draft.maxEmployees} onChange={(value) => setDraft((current) => ({ ...current, maxEmployees: value }))} />
                    <Field label="Meetings / month" type="number" min="1" step="1" value={draft.monthlyMeetingLimit} onChange={(value) => setDraft((current) => ({ ...current, monthlyMeetingLimit: value }))} />
                    <Field label="Max duration (minutes)" type="number" min="1" step="1" value={draft.maxMeetingDurationMinutes} onChange={(value) => setDraft((current) => ({ ...current, maxMeetingDurationMinutes: value }))} />
                    <Field label="Concurrent meetings" type="number" min="1" step="1" value={draft.maxConcurrentMeetings} onChange={(value) => setDraft((current) => ({ ...current, maxConcurrentMeetings: value }))} />
                    <Field label="Validity (days)" type="number" min="1" step="1" value={draft.validityDays} onChange={(value) => setDraft((current) => ({ ...current, validityDays: value }))} />
                    <Field label="Free feature days" type="number" min="0" step="1" placeholder="Blank = none" value={draft.freeFeatureDays} onChange={(value) => setDraft((current) => ({ ...current, freeFeatureDays: value }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <Toggle label="Task management & employee assignment" value={draft.taskManagementEnabled} onChange={(value) => setDraft((current) => ({ ...current, taskManagementEnabled: value }))} />
                      {draft.taskManagementEnabled && (
                        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                          <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={draft.taskManagementUnlimitedDaily}
                              onChange={(event) => setDraft((current) => ({ ...current, taskManagementUnlimitedDaily: event.target.checked }))}
                              className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>Unlimited task assignments per day</span>
                          </label>
                          {!draft.taskManagementUnlimitedDaily && (
                            <Field
                              label="Task assignments per day"
                              type="number"
                              min="1"
                              step="1"
                              value={draft.taskManagementDailyLimit}
                              onChange={(value) => setDraft((current) => ({ ...current, taskManagementDailyLimit: value }))}
                            />
                          )}
                          <p className="text-[11px] leading-5 text-slate-500">
                            Defaults to 10 when enabled. The cap is enforced by the server per company workspace and resets at midnight in that workspace’s timezone. When reached, new task assignments are blocked until the next day.
                          </p>
                        </div>
                      )}
                      <div className="mt-5 border-t border-slate-200 pt-4">
                        <Toggle label="Cloud vault & private company storage" value={draft.vaultEnabled} onChange={(value) => setDraft((current) => ({ ...current, vaultEnabled: value }))} />
                        {draft.vaultEnabled && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="text-xs font-semibold text-slate-700">Storage quota per company</span>
                              <div className="mt-2 flex gap-2">
                                <input type="number" min="0.01" step="0.01" value={draft.vaultQuotaAmount} onChange={(event) => setDraft((current) => ({ ...current, vaultQuotaAmount: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500" />
                                <select aria-label="Storage unit" value={draft.vaultQuotaUnit} onChange={(event) => setDraft((current) => ({ ...current, vaultQuotaUnit: event.target.value as "GB" | "TB" }))} className="rounded-xl border border-slate-300 px-3 py-3 text-sm">
                                  <option value="GB">GB</option>
                                  <option value="TB">TB</option>
                                </select>
                              </div>
                            </label>
                            <Field label="Max size per file (MiB)" type="number" min="1" step="1" value={draft.vaultMaxFileMiB} onChange={(value) => setDraft((current) => ({ ...current, vaultMaxFileMiB: value }))} />
                            <Field label="Maximum stored items" type="number" min="1" step="1" value={draft.vaultMaxItems} onChange={(value) => setDraft((current) => ({ ...current, vaultMaxItems: value }))} />
                            <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">Storage is assigned per company, not per employee. The server reserves bytes and item slots before upload and blocks new uploads at the configured quota. Per-file size is capped at 250 MiB globally to protect production memory and request processing.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Info title="Payment" text="Payment requirement is derived from price: INR 0 is non-payable; positive price uses the existing Razorpay flow." />
                      <Info title="Secure plan limits" text="The browser only configures the plan. Server-side entitlement checks and atomic daily counters enforce limits; company owners cannot change their own cap." />
                      <Info title="Active subscribers" text="Task Management access and its daily cap apply immediately to current subscribers. Historical invoices and payments remain unchanged." />
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-[#faf9f1] px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ""}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel ?? "Confirm"}
        destructive={confirmation?.destructive}
        busy={saving}
        onCancel={() => {
          if (!saving) setConfirmation(null);
        }}
        onConfirm={() => confirmation?.action()}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  min,
  step,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-blue-600" />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-blue-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-[10px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}
