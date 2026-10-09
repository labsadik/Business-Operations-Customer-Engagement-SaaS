"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { clientApi } from "@/lib/client-api";
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  Save,
  ShieldCheck,
  X
} from "lucide-react";
import UserAvatar from "@/components/user-avatar";

type WorkAvailabilityRule = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
};

type ProfilePayload = {
  role: string;
  jobTitle: string;
  department: string;
  employmentStatus: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | string;
  workAvailability?: WorkAvailabilityRule[];
  canEdit: boolean;
};

function roleLabel(role: string) {
  const roles: Record<string, string> = {
    PLATFORM_ADMIN: "Platform Admin",
    COMPANY_ADMIN: "Company Admin",
    EMPLOYEE: "Employee",
    CUSTOMER: "Customer"
  };
  return roles[role] ?? "Unknown role";
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

function formatTime(totalMinutes: number) {
  const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return hour12 + ":" + String(minute).padStart(2, "0") + " " + suffix;
}

function formatDayRanges(dayValues: number[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...new Set(dayValues)].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];

  for (const day of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && day === last[1] + 1) last[1] = day;
    else ranges.push([day, day]);
  }

  return ranges.map(([first, last]) => first === last ? days[first] : days[first] + "–" + days[last]).join(", ");
}

function formatWorkAvailability(rules: WorkAvailabilityRule[]) {
  const groups = new Map<string, { days: number[]; startMinute: number; endMinute: number; timezone: string }>();

  for (const rule of rules) {
    if (
      !Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6 ||
      !Number.isFinite(rule.startMinute) || !Number.isFinite(rule.endMinute) ||
      rule.startMinute < 0 || rule.endMinute <= rule.startMinute || rule.endMinute > 1440
    ) continue;

    const timezone = rule.timezone || "";
    const key = [rule.startMinute, rule.endMinute, timezone].join("|");
    const group = groups.get(key) ?? {
      days: [],
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      timezone
    };
    if (!group.days.includes(rule.dayOfWeek)) group.days.push(rule.dayOfWeek);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => Math.min(...a.days) - Math.min(...b.days) || a.startMinute - b.startMinute)
    .map((group) => {
      const days = formatDayRanges(group.days);
      const hours = formatTime(group.startMinute) + "–" + formatTime(group.endMinute);
      return days + " · " + hours + (group.timezone ? " · " + group.timezone : "");
    });
}

export default function WorkspaceUserProfile({
  name,
  email,
  image,
  currentRole
}: {
  name: string;
  email: string;
  image?: string | null;
  currentRole: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [profileRole, setProfileRole] = useState(currentRole);
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("ACTIVE");
  const [workAvailability, setWorkAvailability] = useState<WorkAvailabilityRule[]>([]);
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
        setProfileRole(profile.role || currentRole);
        setJobTitle(profile.jobTitle || "");
        setDepartment(profile.department || "");
        setEmploymentStatus(profile.employmentStatus || "ACTIVE");
        setWorkAvailability(profile.workAvailability ?? []);
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
  }, [open, currentRole]);

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
      setNotice("Profile details saved.");
    } catch {
      setError("Your profile could not be saved. Your changes are still here; please retry.");
    } finally {
      setSaving(false);
    }
  }

  const availabilityLines = formatWorkAvailability(workAvailability);

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

          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Account role</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">{roleLabel(profileRole || currentRole)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Employee status</p>
                {profileRole === "PLATFORM_ADMIN" ? (
                  <span className={"mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset " + employmentClasses(employmentStatus)}>
                    {employmentLabel(employmentStatus)}
                  </span>
                ) : (
                  <select
                    aria-label="Employee status"
                    value={employmentStatus}
                    onChange={(event) => setEmploymentStatus(event.target.value)}
                    disabled={!canEdit || loading || saving}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="ACTIVE">Active — eligible for new tasks</option>
                    <option value="ON_LEAVE">On leave — not eligible for new tasks</option>
                    <option value="INACTIVE">Inactive — not eligible for new tasks</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Work availability</p>
                {loading ? (
                  <p className="mt-1 text-xs text-slate-500">Loading schedule…</p>
                ) : profileRole === "PLATFORM_ADMIN" && workAvailability.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Not applicable to the platform account</p>
                ) : availabilityLines.length ? (
                  <div className="mt-1 space-y-1.5">
                    {availabilityLines.map((line) => (
                      <p key={line} className="break-words text-xs font-medium leading-5 text-slate-800">{line}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">No working hours configured</p>
                )}
              </div>
            </div>

            <form onSubmit={saveProfile} className="space-y-3 border-t border-slate-100 pt-4">
              <label className="block text-[11px] font-semibold text-slate-700">
                Position / job title
                <span className="relative mt-1.5 block">
                  <Briefcase className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    maxLength={120}
                    disabled={!canEdit || loading || saving}
                    placeholder="e.g. Product Designer"
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
                  placeholder="e.g. Engineering"
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
