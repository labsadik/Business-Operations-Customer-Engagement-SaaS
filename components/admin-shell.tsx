"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  LogOut,
  ShieldCheck,
  UsersRound,
  SlidersHorizontal
} from "lucide-react";

const nav = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/users", label: "Public users", icon: UsersRound },
  { href: "/admin/access", label: "Admin access", icon: ShieldCheck },
  { href: "/admin/platform-settings", label: "Platform settings", icon: SlidersHorizontal }
] as const;

function activePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/companies/")) return "Company details";
  if (pathname.startsWith("/admin/companies")) return "Companies";
  if (pathname.startsWith("/admin/users")) return "Public users";
  if (pathname.startsWith("/admin/access")) return "Admin access";
  if (pathname.startsWith("/admin/platform-settings")) return "Platform settings";
  return "Overview";
}

export default function AdminShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string; image?: string };
}) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-6">
          <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-slate-950 text-white shadow-sm">
            <Image src="/favicon.svg" alt="" width={40} height={40} className="size-full object-cover" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Conventus</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Platform Admin</p>
          </div>
        </div>

        <div className="border-b border-slate-200 px-5 py-5">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-950 text-xs font-semibold text-white">
              {user.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                user.name.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Operational
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Management</p>
          {nav.map((item) => {
            const Icon = item.icon;
            const href = item.href as Route;
            return (
              <Link
                key={item.href}
                href={href}
                className={[
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition",
                  activePath(pathname, item.href)
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                ].join(" ")}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
                {activePath(pathname, item.href) && <ChevronRight className="ml-auto size-4 opacity-60" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <Link href="/dashboard" className="mb-2 flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            <CircleDollarSign className="size-4" />
            Workspace
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex min-h-20 max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">
                <span>Admin</span>
                <ChevronRight className="size-3.5" />
                <span className="text-slate-700">{title}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Platform operations and tenant management</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
                Admin access enabled
              </span>
              <div className="grid size-9 place-items-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Image
                    src={user.image}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  user.name.slice(0, 1).toUpperCase()
                )}
              </div>
            </div>
          </div>
          <div className="border-b border-slate-200 bg-slate-50 lg:hidden">
            <div className="flex gap-2 overflow-x-auto px-4 py-2.5">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className={[
                    "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold",
                    activePath(pathname, item.href) ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-7 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
