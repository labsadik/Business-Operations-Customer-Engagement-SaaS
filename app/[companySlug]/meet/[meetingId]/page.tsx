import Link from "next/link";
import { ArrowLeft, Camera, Command, Mic, PhoneOff, ShieldCheck, Video } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompanyMeetingPage({ params }: { params: Promise<{ companySlug: string; meetingId: string }> }) {
  const { companySlug, meetingId } = await params;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href={`/${companySlug}`} className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-white text-slate-950"><Command className="size-4" /></span>Conventus</Link>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">Meeting {meetingId}</span>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_300px] lg:px-8">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20">
          <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.18),_transparent_45%)] p-8">
            <div className="max-w-md text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20"><Video className="size-7" /></div>
              <h1 className="mt-6 text-2xl font-semibold">Meet with your client</h1>
              <p className="mt-3 text-sm leading-6 text-white/55">This is the company-owned meeting route. The production build will mount the supported Google Meet web meeting surface here after the Google integration phase is complete.</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-white/10 p-4"><button aria-label="Mute microphone" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/5 text-white/80"><Mic className="size-5" /></button><button aria-label="Toggle camera" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/5 text-white/80"><Camera className="size-5" /></button><button aria-label="Leave meeting" className="grid size-11 place-items-center rounded-full bg-rose-500 text-white"><PhoneOff className="size-5" /></button></div>
        </section>

        <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
          <Link href={`/${companySlug}`} className="inline-flex items-center gap-2 text-xs font-medium text-white/50 hover:text-white"><ArrowLeft className="size-4" /> Exit meeting</Link>
          <div className="mt-8"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Meeting details</p><p className="mt-2 text-lg font-semibold">{companySlug}</p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-white/35">Meeting ID</p><p className="mt-1 font-mono text-xs text-white/80">{meetingId}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-white/35">Route</p><p className="mt-1 break-all font-mono text-xs text-white/80">/{companySlug}/meet/{meetingId}</p></div>
            </div>
          </div>
          <div className="mt-8 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-blue-300" /><p className="text-xs leading-5 text-white/55">The backend will resolve this meeting through company ownership, booking state, and authorization before showing the live meeting surface.</p></div></div>
        </aside>
      </div>
    </main>
  );
}