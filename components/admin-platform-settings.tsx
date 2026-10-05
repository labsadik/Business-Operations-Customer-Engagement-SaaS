"use client";

import Image from "next/image";
import { useState } from "react";
import { useNavigationLabels } from "@/components/navigation-labels-provider";
import { Building2, CheckCircle2, Loader2, Save, ShieldCheck } from "lucide-react";

type Settings = {
  legalName: string;
  description: string;
  websiteUrl: string;
  billingEmail: string;
  phone: string;
  logoUrl: string;
  taxId: string;
  gstin: string;
  sacCode: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  gst: {
    enabled: boolean;
    ratePercent: number;
    inclusive: boolean;
  };
  navigation: {
    dashboard: string;
    meetings: string;
    team: string;
    feedback: string;
    supportTickets: string;
    announcements: string;
    billing: string;
    workspaceSettings: string;
    companyProfile: string;
    adminCompanies: string;
    adminPublicUsers: string;
    adminPlans: string;
    adminAnnouncements: string;
    adminFeedback: string;
    adminSupportTickets: string;
    adminAccess: string;
    adminPlatformSettings: string;
  };
};

export default function AdminPlatformSettings({ initial }: { initial: Settings }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { updateLabels } = useNavigationLabels();

  function setValue(key: keyof Settings, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setAddress(key: keyof Settings["address"], value: string) {
    setForm((current) => ({ ...current, address: { ...current.address, [key]: value } }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLATFORM_SETTINGS_UPDATE_FAILED");
      setForm(body.data);
      updateLabels(body.data.navigation);
      setNotice("Settings saved. Navigation labels update without a full-page reload.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PLATFORM_SETTINGS_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
              <ShieldCheck className="size-4" />
              Platform settings
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Conventus legal identity</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              This data lives in MongoDB and is copied into new invoices as the merchant snapshot. It is not read from admin-email environment variables.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/65">
            <p className="font-semibold text-white">Invoice source</p>
            <p className="mt-1">PlatformSettings · default</p>
          </div>
        </div>
      </section>

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
          <CheckCircle2 className="size-4 text-blue-600" />
          {notice}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h2 className="text-sm font-semibold">Navigation labels</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Rename menus and their matching page labels. Changes appear in the open website without a full-page reload.
          </p>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Dashboard / overview" value={form.navigation.dashboard} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, dashboard: v } }))} />
          <Field label="Meetings" value={form.navigation.meetings} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, meetings: v } }))} />
          <Field label="Team" value={form.navigation.team} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, team: v } }))} />
          <Field label="Feedback" value={form.navigation.feedback} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, feedback: v } }))} />
          <Field label="Support tickets" value={form.navigation.supportTickets} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, supportTickets: v } }))} />
          <Field label="Announcements" value={form.navigation.announcements} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, announcements: v } }))} />
          <Field label="Billing" value={form.navigation.billing} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, billing: v } }))} />
          <Field label="Workspace settings" value={form.navigation.workspaceSettings} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, workspaceSettings: v } }))} />
          <Field label="Company profile" value={form.navigation.companyProfile} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, companyProfile: v } }))} />
          <Field label="Admin companies" value={form.navigation.adminCompanies} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminCompanies: v } }))} />
          <Field label="Admin public users" value={form.navigation.adminPublicUsers} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminPublicUsers: v } }))} />
          <Field label="Admin plans" value={form.navigation.adminPlans} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminPlans: v } }))} />
          <Field label="Admin announcements" value={form.navigation.adminAnnouncements} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminAnnouncements: v } }))} />
          <Field label="Admin feedback" value={form.navigation.adminFeedback} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminFeedback: v } }))} />
          <Field label="Admin support tickets" value={form.navigation.adminSupportTickets} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminSupportTickets: v } }))} />
          <Field label="Admin access" value={form.navigation.adminAccess} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminAccess: v } }))} />
          <Field label="Admin platform settings" value={form.navigation.adminPlatformSettings} onChange={(v) => setForm((current) => ({ ...current, navigation: { ...current.navigation, adminPlatformSettings: v } }))} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Legal business name" value={form.legalName} onChange={(v) => setValue("legalName", v)} />
          <Field label="Billing email" type="email" value={form.billingEmail} onChange={(v) => setValue("billingEmail", v)} />
          <Field label="Website" value={form.websiteUrl} onChange={(v) => setValue("websiteUrl", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => setValue("phone", v)} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <span className="text-xs font-semibold text-slate-700">Conventus logo</span>
            <div className="mt-2 flex items-center gap-3">
              <Image src="/favicon.svg" alt="Conventus" width={40} height={40} className="size-10 rounded-xl object-cover" />
              <div>
                <p className="text-xs font-semibold text-slate-900">Bundled locally</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Used by the app, dashboard, website, invoices and favicon.</p>
              </div>
            </div>
          </div>
          <Field label="Tax ID" value={form.taxId} onChange={(v) => setValue("taxId", v)} />
          <Field label="GSTIN" value={form.gstin} onChange={(v) => setValue("gstin", v)} />
          <Field label="SAC code" value={form.sacCode} onChange={(v) => setValue("sacCode", v)} />
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-semibold text-slate-700">Invoice/company description</span>
          <textarea
            value={form.description}
            onChange={(event) => setValue("description", event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </label>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-blue-600" />
          <h2 className="text-sm font-semibold">Registered address</h2>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {(["line1", "line2", "city", "state", "postalCode", "country"] as const).map((key) => (
            <Field
              key={key}
              label={key === "line1" ? "Address line 1" : key === "line2" ? "Address line 2" : key === "postalCode" ? "Postal code" : key[0].toUpperCase() + key.slice(1)}
              value={form.address[key]}
              onChange={(v) => setAddress(key, v)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h2 className="text-sm font-semibold">GST treatment</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Used for invoice calculation at capture/backfill time. Existing complete invoice snapshots are preserved.</p>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Field
            label="GST rate %"
            type="number"
            value={String(form.gst.ratePercent)}
            onChange={(v) => setForm((current) => ({ ...current, gst: { ...current.gst, ratePercent: Number(v) } }))}
          />
          <Toggle label="GST enabled" value={form.gst.enabled} onChange={(v) => setForm((current) => ({ ...current, gst: { ...current.gst, enabled: v } }))} />
          <Toggle label="Price includes GST" value={form.gst.inclusive} onChange={(v) => setForm((current) => ({ ...current, gst: { ...current.gst, inclusive: v } }))} />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {saving ? "Saving..." : "Save platform settings"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-blue-600" />
    </label>
  );
}
