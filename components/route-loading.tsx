function Pulse({ className }: { className: string }) {
  return <div className={"animate-pulse rounded-2xl bg-slate-200/80 " + className} aria-hidden="true" />;
}

export function LandingLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <div className="border-b border-slate-200 bg-[#faf9f1]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Pulse className="h-9 w-32" />
          <div className="hidden gap-4 md:flex"><Pulse className="h-4 w-20" /><Pulse className="h-4 w-20" /><Pulse className="h-4 w-20" /></div>
          <Pulse className="h-10 w-28" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div><Pulse className="h-7 w-60" /><Pulse className="mt-5 h-20 w-full max-w-2xl sm:h-28" /><Pulse className="mt-5 h-16 w-full max-w-xl" /><div className="mt-7 flex gap-3"><Pulse className="h-12 w-32" /><Pulse className="h-12 w-32" /></div></div>
          <Pulse className="h-[360px] w-full rounded-[2rem]" />
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,i)=><Pulse key={i} className="h-44" />)}</div>
      </div>
    </main>
  );
}

export function LoginLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-5 py-8 sm:px-6 lg:grid-cols-[1.05fr_.75fr] lg:items-center lg:px-8">
        <section className="hidden rounded-[2rem] border border-slate-200 bg-white p-10 lg:block lg:min-h-[620px]">
          <Pulse className="h-9 w-32" /><Pulse className="mt-20 h-14 w-full max-w-xl" /><Pulse className="mt-5 h-16 w-full max-w-lg" /><div className="mt-8 grid grid-cols-3 gap-3">{Array.from({length:3},(_,i)=><Pulse key={i} className="h-28" />)}</div>
        </section>
        <section className="rounded-[2rem] border border-slate-200 bg-white p-7 sm:p-9">
          <Pulse className="h-5 w-28" /><Pulse className="mt-10 h-9 w-56" /><Pulse className="mt-4 h-12 w-full" /><Pulse className="mt-7 h-12 w-full" /><Pulse className="mt-5 h-28 w-full" />
        </section>
      </div>
    </main>
  );
}

export function BookingLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8">
        <Pulse className="h-10 w-40" />
        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8"><Pulse className="h-8 w-64" /><Pulse className="mt-3 h-12 w-full max-w-2xl" /><div className="mt-8 grid gap-6 lg:grid-cols-[.75fr_1.25fr]"><Pulse className="h-[420px]" /><Pulse className="h-[420px]" /></div></div>
      </div>
    </main>
  );
}

export function WorkspaceLoading() {
  return <main className="min-h-screen bg-[#faf9f1]"><div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10"><Pulse className="h-14 w-full" /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,i)=><Pulse key={i} className="h-28" />)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]"><Pulse className="h-[560px]" /><Pulse className="h-[420px]" /></div></div></main>;
}

export function CompanyProfileLoading() {
  return <WorkspaceLoading />;
}

export function AdminContentLoading() {
  return <div className="space-y-5"><Pulse className="h-36 w-full rounded-3xl" /><Pulse className="h-12 w-full max-w-sm" /><Pulse className="h-[520px] w-full rounded-3xl" /></div>;
}

export function BillingLoading() {
  return <main className="min-h-screen bg-[#faf9f1]"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8"><Pulse className="h-16 w-full" /><Pulse className="mt-6 h-44 w-full rounded-[2rem]" /><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"><Pulse className="h-[620px] rounded-[2rem]" /><Pulse className="h-[420px] rounded-[2rem]" /></div></div></main>;
}

export function InvoiceLoading() {
  return <BillingLoading />;
}

export function InviteLoading() {
  return <main className="grid min-h-screen place-items-center bg-[#faf9f1] px-5"><div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 sm:p-10"><Pulse className="h-11 w-11" /><Pulse className="mt-8 h-5 w-40" /><Pulse className="mt-3 h-10 w-full" /><Pulse className="mt-4 h-14 w-full" /><Pulse className="mt-7 h-12 w-full" /></div></main>;
}