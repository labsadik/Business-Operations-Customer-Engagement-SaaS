import Link from "next/link";
import { ArrowLeft, Check, Command, ShieldCheck } from "lucide-react";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-stretch lg:grid-cols-2">
        <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-white text-slate-950"><Command className="size-4" /></span>Conventus</Link>
            <div className="mt-24 max-w-xl">
              <p className="text-sm font-semibold text-blue-300">One account. One secure flow.</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em]">Create, route, and meet without operational clutter.</h1>
              <p className="mt-6 text-base leading-7 text-white/60">Companies and employees use the main Conventus application. Customers sign in from the company’s shared booking page.</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-white/60">{["Google-based sign-in", "Company-scoped workspaces", "Server-authoritative booking state"].map((item) => <div key={item} className="flex items-center gap-2"><Check className="size-4 text-blue-300" />{item}</div>)}</div>
        </section>

        <section className="flex items-center px-5 py-10 sm:px-8 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" />Back to home</Link>
            <div className="mt-10 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
              <p className="text-sm font-semibold text-blue-600">Welcome to Conventus</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in with Google</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Google identity is used for sign-in. Calendar and Meet permissions will be requested only for company and employee workflows that need them.</p>
              <Link href="/api/auth/google/start" className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <span className="grid size-6 place-items-center rounded-full bg-slate-100 text-xs font-bold">G</span>
                Continue with Google
              </Link>
              {error && (
                <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                  Google sign-in is not ready for this workspace yet ({error.replaceAll("_", " ")}).
                </div>
              )}

              <div className="mt-6 flex gap-3 rounded-2xl bg-slate-50 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" /><p className="text-xs leading-5 text-slate-600">OAuth secrets and refresh tokens stay server-side and will never be exposed to browser JavaScript.</p></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}