"use client";

import Link from "next/link";
import UserAvatar from "@/components/user-avatar";
import { useNavigationLabels } from "@/components/navigation-labels-provider";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import PublicPageShare from "@/components/public-page-share";
import ConfirmDialog from "@/components/confirm-dialog";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UsersRound
} from "lucide-react";

type ProfileData = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  taxId: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  publicBookingEnabled: boolean;
  profileComplete: boolean;
  owner: { name: string; email: string; image: string } | null;
};

type CompanyResponse = {
  company: ProfileData;
  memberCount: number;
  canPublish: boolean;
  featureLocked: boolean;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "REQUEST_FAILED") as Error & { details?: unknown };
    error.details = body.details;
    throw error;
  }
  return body.data as T;
}

export default function CompanyProfile({
  user,
  currentRole
}: {
  user: { name: string; email: string; image?: string };
  currentRole: string;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [canPublish, setCanPublish] = useState(false);
  const [featureLocked, setFeatureLocked] = useState(false);
  const [form, setForm] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const { labels } = useNavigationLabels();

  async function load() {
    try {
      const data = await api<CompanyResponse>("/api/company");
      setProfile(data.company);
      setForm(data.company);
      setMemberCount(data.memberCount);
      setCanPublish(data.canPublish);
      setFeatureLocked(data.featureLocked);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, []);

  const complete = useMemo(
    () =>
      Boolean(
        form?.name.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form?.email.trim() || "") &&
        form?.phone.replace(/[^0-9+]/g, "").length >= 8 &&
        form?.phone.replace(/[^0-9+]/g, "").length <= 18
      ),
    [form]
  );

  function setField<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function setAddress(key: keyof ProfileData["address"], value: string) {
    setForm((current) =>
      current
        ? { ...current, address: { ...current.address, [key]: value } }
        : current
    );
  }

  async function togglePublic() {
    if (!form || publishing) return;
    if (!form.publicBookingEnabled && (!canPublish || featureLocked)) {
      setError("PUBLISH_REQUIRES_READY_MEMBER");
      return;
    }
    setPublishing(true);
    setError("");
    setSaved(false);
    try {
      const next = !form.publicBookingEnabled;
      const result = await api<{ company: ProfileData }>("/api/company", {
        method: "PATCH",
        body: JSON.stringify({ publicBookingEnabled: next })
      });
      setProfile(result.company);
      setForm(result.company);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PUBLIC_PAGE_UPDATE_FAILED");
    } finally {
      setPublishing(false);
      setPublishConfirmationOpen(false);
      window.setTimeout(() => setSaved(false), 2500);
    }
  }


  async function save() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const result = await api<{ company: ProfileData }>("/api/company", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          email: form.email,
          phone: form.phone,
          logoUrl: form.logoUrl,
          websiteUrl: form.websiteUrl,
          description: form.description,
          taxId: form.taxId,
          address: form.address
        })
      });
      setProfile(result.company);
      setForm(result.company);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "COMPANY_PROFILE_UPDATE_FAILED");
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaved(false), 2500);
    }
  }

  if (loading || !form || !profile) {
    return (
      <main className="min-h-screen bg-[#faf9f1]">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
          <div className="h-10 w-40 animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-6 h-56 animate-pulse rounded-[2rem] bg-white ring-1 ring-slate-200" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="h-[620px] animate-pulse rounded-[2rem] bg-white ring-1 ring-slate-200" />
            <div className="h-[320px] animate-pulse rounded-[2rem] bg-white ring-1 ring-slate-200" />
          </div>
        </div>
      </main>
    );
  }

  const slugChanged = form.slug !== profile.slug;

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <WorkspaceSidebar
        companyName={form.name}
        userName={user.name}
        userEmail={user.email}
        currentRole={currentRole}
        canManage
        activeProfile
      />
      <div className="lg:pl-72">
      <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-950 text-white">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Building2 className="size-6" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{labels.companyProfile}</p>
                <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight sm:text-4xl">{form.name}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Keep your billing identity and invoice details accurate.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <span className={`size-2 rounded-full ${complete ? "bg-emerald-500" : "bg-amber-500"}`} />
                {complete ? "Billing ready" : "Profile incomplete"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <UsersRound className="size-3.5" />
                {memberCount} members
              </span>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Business identity</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">These details are used by checkout and future invoices.</p>
              </div>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Saved
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company name *
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company email *
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                  <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company phone *
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                  <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Public slug *
                <input value={form.slug} onChange={(e) => setField("slug", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500" />
                <span className="text-[11px] font-normal text-slate-400">/{form.slug}</span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
                Website
                <div className="relative">
                  <Globe2 className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                  <input type="url" value={form.websiteUrl} onChange={(e) => setField("websiteUrl", e.target.value)} placeholder="https://company.com" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
                Description
                <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={5} maxLength={1200} className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500" placeholder="Describe the company..." />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
                Company logo URL
                <input value={form.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500" />
              </label>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-blue-600" />
                <div>
                  <h3 className="text-sm font-semibold">Billing address</h3>
                  <p className="mt-1 text-xs text-slate-500">Optional now; stored with future invoices when provided.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {([
                  ["line1", "Address line 1"],
                  ["line2", "Address line 2"],
                  ["city", "City"],
                  ["state", "State / region"],
                  ["postalCode", "Postal code"],
                  ["country", "Country"]
                ] as const).map(([key, label]) => (
                  <label key={key} className="grid gap-2 text-sm font-semibold text-slate-800">
                    {label}
                    <input value={form.address[key]} onChange={(e) => setAddress(key, e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500" />
                  </label>
                ))}
              </div>

              <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800">
                Tax / registration ID
                <input value={form.taxId} onChange={(e) => setField("taxId", e.target.value)} placeholder="GSTIN or other registration number" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500" />
              </label>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error.replaceAll("_", " ")}
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(profile)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !complete}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="size-4" />
                {saving ? "Saving..." : "Save company profile"}
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <PublicPageShare
              savedSlug={profile.slug}
              draftSlug={form.slug}
              published={form.publicBookingEnabled}
              canPublish={complete && canPublish && !featureLocked}
              busy={publishing}
              onPublishRequest={() => setPublishConfirmationOpen(true)}
            />

            {slugChanged && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Slug change</p>
                <p className="mt-2 text-sm font-semibold text-amber-950">Save the company profile to apply the new public URL.</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  The current live page remains /{profile.slug}. After saving, the page URL will become /{form.slug}.
                </p>
              </section>
            )}

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Payment readiness</h2>
                  <p className="mt-1 text-xs text-slate-500">Razorpay checkout uses the company identity below.</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-3">
                  <span className="text-xs text-slate-500">Name</span>
                  <span className="text-xs font-semibold text-slate-800">{Boolean(form.name.trim()) ? "Ready" : "Missing"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-3">
                  <span className="text-xs text-slate-500">Email</span>
                  <span className="text-xs font-semibold text-slate-800">{/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "Ready" : "Missing"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-3">
                  <span className="text-xs text-slate-500">Phone</span>
                  <span className="text-xs font-semibold text-slate-800">{form.phone.replace(/[^0-9+]/g, "").length >= 8 ? "Ready" : "Missing"}</span>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Primary owner</p>
              <div className="mt-4 flex items-center gap-3">
                <UserAvatar
                  name={form.owner?.name || user.name}
                  email={form.owner?.email || user.email}
                  image={form.owner?.image}
                  size={44}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{form.owner?.name || user.name}</p>
                  <p className="truncate text-xs text-slate-500">{form.owner?.email || user.email}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={publishConfirmationOpen}
        title={form.publicBookingEnabled ? "Unpublish public booking page?" : "Publish public booking page?"}
        description={
          form.publicBookingEnabled
            ? "Unpublishing will prevent visitors from opening the public booking page. Existing customer requests are not deleted."
            : "Publishing will make the public booking page accessible. Visitors must still sign in with Google before seeing availability or submitting a request."
        }
        confirmLabel={form.publicBookingEnabled ? "Unpublish page" : "Publish page"}
        tone={form.publicBookingEnabled ? "destructive" : "success"}
        busy={publishing}
        onCancel={() => {
          if (!publishing) setPublishConfirmationOpen(false);
        }}
        onConfirm={() => void togglePublic()}
      />
      </div>
    </main>
  );
}
