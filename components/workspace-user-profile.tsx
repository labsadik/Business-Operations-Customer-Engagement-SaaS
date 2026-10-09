"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { clientApi, clientFetch } from "@/lib/client-api";
import {
  Briefcase,
  Building2,
  ChevronDown,
  LoaderCircle,
  Save,
  ShieldCheck,
  X
} from "lucide-react";
import UserAvatar from "@/components/user-avatar";

type ProfilePayload = {
  companyName: string;
  role: string;
  jobTitle: string;
  department: string;
  employmentStatus: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | string;
  canEdit: boolean;
};

function roleLabel(role: string) {
  const roles: Record<string, string> = {
    PLATFORM_ADMIN: "Platform Admin",
    COMPANY_OWNER: "Company Owner",
    COMPANY_ADMIN: "Company Admin",
    EMPLOYEE: "Employee"
  };
  return roles[role] ?? role.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function employmentLabel(status: string) {
  if (status === "ON_LEAVE") return "On leave";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

function employmentClasses(status: string) {
  if (status === "ON_LEAVE") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "INACTIVE") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export default function WorkspaceUserProfile({
  name,
  email,
  image,
  companyName,
  currentRole
}: {
  name: string;
  email: string;
  image?: string | null;
  companyName: string;
  currentRole: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [profileCompany, setProfileCompany] = useState(companyName);
  const [profileRole, setProfileRole] = useState(currentRole);
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("ACTIVE");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    clientApi<ProfilePayload>("/api/profile/member", { signal: controller.signal })
      .then((profile) => {
        if (cancelled) return;
        setProfileCompany(profile.companyName || companyName);
        setProfileRole(profile.role || currentRole);
        setJobTitle(profile.jobTitle || "");
        setDepartment(profile.department || "");
        setEmploymentStatus(profile.employmentStatus || "ACTIVE");
        setCanEdit(Boolean(profile.canEdit));
      })
      .catch((loadError: unknown) => {
        if (cancelled || (loadError instanceof Error && loadError.name === "AbortError")) return;
        setError("Profile details could not be loaded. Close this panel and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, companyName, currentRole]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canEdit) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await clientApi<ProfilePayload>("/api/profile/member", {
        method: "PATCH",
        body: JSON.stringify({
          jobTitle,
          department,
          ...(profileRole === "PLATFORM_ADMIN" ? {} : { employmentStatus })
        })
      });
      setJobTitle(updated.jobTitle || "");
      setDepartment(updated.department || "");
      setEmploymentStatus(updated.employmentStatus || employmentStatus);
      if (profileRole !== "PLATFORM_ADMIN") {
        window.dispatchEvent(new CustomEvent("conventus:employment-status-updated", {
          detail: { employmentStatus: updated.employmentStatus || employmentStatus }
        }));
      }
      setNotice(profileRole === "PLATFORM_ADMIN"
        ? "Your position and department have been saved."
        : "Your profile and work status have been saved.");
    } catch {
      setError("Your profile could not be saved. Your changes are still here; please retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen) {
            setLoading(true);
            setError("");
            setNotice("");
          }
          setOpen(nextOpen);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open your profile"
        className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-3 sm:px-3"
      >
        <UserAvatar name={name || email} email={email} image={image} fallbackImage="/api/profile/avatar" size={38} />
        <span className="block min-w-0 max-w-[34vw] sm:max-w-48">
          <span className="block truncate text-[11px] font-semibold text-slate-900 sm:text-xs">{name || email}</span>
          <span className="block truncate text-[10px] text-slate-500">{email}</span>
        </span>
        <ChevronDown className={"hidden size-3.5 shrink-0 text-slate-400 transition sm:block " + (open ? "rotate-180" : "")} aria-hidden="true" />
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Your profile details"
          className="absolute right-0 top-full z-[80] mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={name || email} email={email} image={image} fallbackImage="/api/profile/avatar" size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{name || email}</p>
                <p className="truncate text-[11px] text-slate-500">{email}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Close profile">
              <X className="size-4" />
            </button>
          </div>

          {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-[11px] text-rose-800">{error}</p>}
          {notice && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[11px] text-emerald-800">{notice}</p>}

          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Company</p>
                <p className="mt-1 break-words text-xs font-semibold text-slate-800">{profileCompany || companyName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Account role</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">{roleLabel(profileRole || currentRole)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Employment status</p>
                <span className={"mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset " + employmentClasses(employmentStatus)}>
                  {employmentLabel(employmentStatus)}
                </span>
              </div>
            </div>

            <form onSubmit={saveProfile} className="space-y-3 border-t border-slate-100 pt-4">
              {profileRole !== "PLATFORM_ADMIN" && (
                <label className="block text-[11px] font-semibold text-slate-700">
                  Work availability
                  <select
                    value={employmentStatus}
                    onChange={(event) => setEmploymentStatus(event.target.value)}
                    disabled={!canEdit || loading || saving}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="ACTIVE">Active — eligible for new tasks</option>
                    <option value="ON_LEAVE">On leave — not eligible for new tasks</option>
                    <option value="INACTIVE">Inactive — not eligible for new tasks</option>
                  </select>
                  <span className="mt-1 block text-[10px] font-normal leading-4 text-slate-500">Your status is saved to your workspace membership.</span>
                </label>
              )}
              <label className="block text-[11px] font-semibold text-slate-700">
                Position / job title
                <span className="relative mt-1.5 block">
                  <Briefcase className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    maxLength={120}
                    disabled={!canEdit || loading || saving}
                    placeholder="e.g. UX Designer, CTO, CEO"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </span>
              </label>
              <label className="block text-[11px] font-semibold text-slate-700">
                Department
                <input
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  maxLength={100}
                  disabled={!canEdit || loading || saving}
                  placeholder="e.g. Design, Engineering, Finance"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
              {canEdit ? (
                <button type="submit" disabled={saving || loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving || loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  {saving ? "Saving profile…" : "Save profile"}
                </button>
              ) : (
                <p className="text-[10px] leading-4 text-slate-500">These details are managed by your organization.</p>
              )}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
