import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center px-5 py-8 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:gap-10 lg:py-12">
        <section className="hidden lg:block">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
              <img src="/favicon.svg" alt="" className="size-6" />
            </span>
            Conventus
          </Link>
          <div className="mt-20 max-w-2xl">
            <p className="text-sm font-semibold text-blue-600">Professional scheduling infrastructure</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-slate-950">
              One secure workspace for every customer conversation.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
              Manage your team, route requests, and keep meeting operations in one company-scoped workspace.
            </p>
            <div className="mt-9 space-y-3 text-sm text-slate-600">
              {["Company-scoped access", "Server-authoritative booking state", "Secure meeting delivery"].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-full bg-blue-50 text-blue-600">
                    <Check className="size-3.5" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>

          <div className="mt-10">
            <p className="text-sm font-semibold text-blue-600">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in securely</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Continue with your account to access your company workspace.
            </p>

            {error && (
              <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                Sign-in could not be completed ({error.replaceAll("_", " ")}).
              </div>
            )}

            <Link
              href="/api/auth/google/start"
              className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">→</span>
              Continue securely
            </Link>

            <div className="mt-6 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
              <p className="text-xs leading-5 text-slate-600">
                Authentication credentials and service credentials stay server-side.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
