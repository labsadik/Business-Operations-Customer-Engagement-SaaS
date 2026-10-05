export function Pulse({ className }: { className: string }) {
  return (
    <div
      className={"rounded-xl bg-slate-200/70 motion-safe:animate-pulse " + className}
      aria-hidden="true"
    />
  );
}

function SidebarSkeleton() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-5">
        <Pulse className="size-10 rounded-xl" />
        <div className="space-y-2">
          <Pulse className="h-3 w-24" />
          <Pulse className="h-2 w-20" />
        </div>
      </div>
      <div className="border-b border-slate-200 p-5">
        <Pulse className="h-16 w-full rounded-2xl" />
      </div>
      <div className="space-y-2 p-4">
        <Pulse className="h-3 w-20" />
        {Array.from({ length: 7 }, (_, index) => (
          <Pulse key={index} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    </aside>
  );
}

export function LandingLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <div className="border-b border-slate-200 bg-[#faf9f1]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Pulse className="h-9 w-32" />
          <div className="hidden gap-4 md:flex">
            <Pulse className="h-4 w-20" />
            <Pulse className="h-4 w-20" />
            <Pulse className="h-4 w-20" />
          </div>
          <Pulse className="h-10 w-28" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <Pulse className="h-7 w-60" />
            <Pulse className="mt-5 h-24 w-full max-w-2xl sm:h-28" />
            <Pulse className="mt-5 h-16 w-full max-w-xl" />
            <div className="mt-7 flex gap-3">
              <Pulse className="h-12 w-32" />
              <Pulse className="h-12 w-32" />
            </div>
          </div>
          <Pulse className="h-[360px] w-full rounded-[2rem]" />
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Pulse key={index} className="h-44" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function LoginLoading() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen max-w-[1440px] md:grid-cols-2">
        <section className="hidden min-h-screen items-center border-r border-slate-200 bg-slate-50 p-7 md:flex md:p-9">
          <div className="w-full max-w-xl">
            <Pulse className="h-3 w-36" />
            <Pulse className="mt-3 h-10 w-72 max-w-full" />
            <Pulse className="mt-2 h-4 w-80 max-w-full" />
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
              <Pulse className="h-6 w-44" />
              <Pulse className="mt-3 h-28 w-full rounded-xl" />
            </div>
          </div>
        </section>

        <section className="flex min-h-screen flex-col bg-white">
          <div className="flex min-h-0 flex-1 flex-col px-5 py-3 sm:px-8 lg:px-12">
            <div className="flex items-center justify-between">
              <Pulse className="h-9 w-32 rounded-xl" />
              <Pulse className="h-8 w-16 rounded-lg" />
            </div>
            <div className="flex flex-1 items-center py-6">
              <div className="w-full">
                <Pulse className="h-3 w-24" />
                <Pulse className="mt-3 h-10 w-80 max-w-full" />
                <Pulse className="mt-4 h-10 w-full max-w-xl" />
                <Pulse className="mt-4 h-12 w-full" />
              </div>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex gap-4">
                <Pulse className="h-5 w-14" />
                <Pulse className="h-5 w-16" />
                <Pulse className="h-5 w-24" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function BookingLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Pulse className="size-10 rounded-xl" />
            <div className="space-y-2">
              <Pulse className="h-3 w-32" />
              <Pulse className="h-2 w-20" />
            </div>
          </div>
          <Pulse className="h-9 w-20 rounded-xl" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Pulse className="size-14 rounded-2xl" />
              <Pulse className="mt-5 h-4 w-44" />
              <Pulse className="mt-3 h-12 w-full max-w-2xl" />
              <Pulse className="mt-3 h-16 w-full max-w-2xl" />
            </div>
            <Pulse className="h-40 rounded-2xl" />
          </div>
        </section>
        <section className="mt-5">
          <div className="mb-3 flex justify-between gap-4">
            <div>
              <Pulse className="h-3 w-24" />
              <Pulse className="mt-2 h-6 w-48" />
            </div>
            <Pulse className="h-8 w-28 rounded-full" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
            <Pulse className="h-[430px] rounded-3xl" />
            <Pulse className="h-[430px] rounded-3xl" />
          </div>
        </section>
      </div>
    </main>
  );
}

export function WorkspaceLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <div className="flex min-h-screen">
        <SidebarSkeleton />
        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-[#faf9f1]">
            <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
              <div>
                <Pulse className="h-2.5 w-20" />
                <Pulse className="mt-2 h-5 w-44" />
              </div>
              <Pulse className="size-9 rounded-xl" />
            </div>
          </header>
          <div className="mx-auto max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Pulse key={index} className="h-28 rounded-3xl" />
              ))}
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
              <Pulse className="h-[520px] rounded-3xl" />
              <div className="space-y-6">
                <Pulse className="h-56 rounded-3xl" />
                <Pulse className="h-60 rounded-3xl" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function CompanyProfileLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <div className="flex min-h-screen">
        <SidebarSkeleton />
        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-[#faf9f1] lg:hidden">
            <Pulse className="mx-4 my-3 h-9 rounded-xl" />
          </div>
          <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
            <Pulse className="h-9 w-40 rounded-xl" />
            <Pulse className="mt-5 h-40 w-full rounded-[2rem]" />
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
              <Pulse className="h-[620px] rounded-[2rem]" />
              <div className="space-y-6">
                <Pulse className="h-64 rounded-[2rem]" />
                <Pulse className="h-52 rounded-[2rem]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminHeroSkeleton() {
  return (
    <>
      <Pulse className="h-36 w-full rounded-[2rem] bg-slate-800" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <Pulse key={index} className="h-44 rounded-3xl" />)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <Pulse className="h-72 rounded-3xl" />
        <Pulse className="h-72 rounded-3xl" />
      </div>
    </>
  );
}

export function AdminOverviewLoading() {
  return <AdminHeroSkeleton />;
}

export function AdminCompaniesLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <Pulse className="h-5 w-28" />
        <Pulse className="mt-3 h-8 w-64" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-5 flex justify-end"><Pulse className="h-11 w-full max-w-md rounded-xl" /></div>
      </section>
      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <Pulse className="h-14 w-full rounded-none" />
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="grid min-h-20 gap-3 px-5 py-4 lg:grid-cols-5">
              <Pulse className="h-10 w-48 max-w-full rounded-xl" />
              <Pulse className="h-7 w-20 rounded-full" />
              <Pulse className="h-5 w-16 rounded-lg" />
              <Pulse className="h-5 w-20 rounded-lg" />
              <Pulse className="h-8 w-14 justify-self-end rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminCompanyDetailsLoading() {
  return (
    <div>
      <Pulse className="h-4 w-32" />
      <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <Pulse className="size-14 rounded-2xl" />
          <div className="min-w-0 space-y-2">
            <Pulse className="h-3 w-32" />
            <Pulse className="h-8 w-64 max-w-full" />
            <Pulse className="h-3 w-48" />
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Pulse key={index} className="h-32 rounded-3xl" />)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <Pulse className="h-[500px] rounded-3xl" />
          <Pulse className="h-[420px] rounded-3xl" />
          <Pulse className="h-[360px] rounded-3xl" />
        </div>
        <Pulse className="h-[520px] rounded-3xl" />
      </div>
    </div>
  );
}

export function AdminUsersLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <Pulse className="h-5 w-28" />
        <Pulse className="mt-3 h-8 w-60" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <Pulse className="mt-5 h-11 w-full max-w-md rounded-xl" />
      </section>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <Pulse className="h-14 w-full rounded-none" />
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div className="flex items-center gap-3">
                <Pulse className="size-10 rounded-full" />
                <div className="space-y-2">
                  <Pulse className="h-3 w-36" />
                  <Pulse className="h-2.5 w-48 max-w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Pulse className="h-2.5 w-20" />
                <Pulse className="h-4 w-32 max-w-full" />
              </div>
              <div className="flex gap-2">
                <Pulse className="h-14 w-20 rounded-xl" />
                <Pulse className="h-14 w-20 rounded-xl" />
                <Pulse className="h-14 w-20 rounded-xl" />
              </div>
              <div className="space-y-2 lg:text-right">
                <Pulse className="ml-auto h-2.5 w-24" />
                <Pulse className="ml-auto h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminAccessLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <Pulse className="h-5 w-24" />
        <Pulse className="mt-3 h-8 w-56" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <Pulse className="mt-5 h-11 w-full max-w-md rounded-xl" />
      </section>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <Pulse className="h-4 w-40" />
          <Pulse className="mt-2 h-3 w-56" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div className="flex items-center gap-3">
                <Pulse className="size-11 rounded-full" />
                <div className="space-y-2">
                  <Pulse className="h-3 w-36" />
                  <Pulse className="h-2.5 w-48 max-w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Pulse className="h-2.5 w-20" />
                <Pulse className="h-7 w-32 rounded-full" />
              </div>
              <div className="space-y-2">
                <Pulse className="h-2.5 w-24" />
                <Pulse className="h-4 w-44 max-w-full" />
              </div>
              <Pulse className="h-10 w-28 rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminFeedbackLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
        <Pulse className="h-4 w-36" />
        <Pulse className="mt-3 h-8 w-48" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Pulse key={index} className="h-10 rounded-xl" />)}
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }, (_, index) => (
            <article key={index} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex gap-2">
                    <Pulse className="h-6 w-28 rounded-full" />
                    <Pulse className="h-6 w-20 rounded-full" />
                  </div>
                  <Pulse className="h-4 w-40" />
                  <Pulse className="h-3 w-28" />
                  <Pulse className="h-10 w-full max-w-2xl" />
                </div>
                <Pulse className="h-9 w-28 rounded-xl" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminSupportTicketsLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
        <Pulse className="h-4 w-40" />
        <Pulse className="mt-3 h-8 w-56" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Pulse className="h-10 rounded-xl" />
          <Pulse className="h-10 rounded-xl" />
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Pulse className="size-10 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Pulse className="h-6 w-20 rounded-full" />
                    <Pulse className="h-6 w-24 rounded-full" />
                  </div>
                  <Pulse className="h-4 w-56 max-w-full" />
                  <Pulse className="h-3 w-72 max-w-full" />
                </div>
                <Pulse className="h-9 w-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminPlansLoading() {
  return (
    <div>
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <Pulse className="h-5 w-20" />
        <Pulse className="mt-3 h-8 w-48" />
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px]">
          <Pulse className="h-11 rounded-xl" />
          <Pulse className="h-11 rounded-xl" />
        </div>
      </section>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Pulse key={index} className="h-72 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

export function AdminAnnouncementsLoading() {
  return (
    <div>
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Pulse className="h-4 w-36" />
            <Pulse className="h-8 w-48" />
            <Pulse className="h-4 w-96 max-w-full" />
          </div>
          <Pulse className="h-11 w-40 rounded-xl" />
        </div>
      </section>
      <section className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <Pulse className="h-10 rounded-xl" />
        <Pulse className="h-10 rounded-xl" />
        <Pulse className="h-10 rounded-xl" />
      </section>
      <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5">
        <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <Pulse key={index} className="h-28 rounded-2xl" />)}</div>
      </section>
    </div>
  );
}

export function AdminPlatformSettingsLoading() {
  return (
    <div>
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
        <Pulse className="h-4 w-32" />
        <Pulse className="mt-3 h-8 w-60" />
        <Pulse className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 8 }, (_, index) => <Pulse key={index} className="h-11 rounded-xl" />)}
        </div>
      </section>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6">
        <Pulse className="h-4 w-44" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => <Pulse key={index} className="h-12 rounded-xl" />)}
        </div>
      </section>
    </div>
  );
}

export function BillingLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Pulse className="h-9 w-32 rounded-xl" />
          <Pulse className="h-10 w-28 rounded-xl" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Pulse className="h-3 w-24" />
        <Pulse className="mt-3 h-10 w-64" />
        <Pulse className="mt-3 h-12 w-full max-w-2xl" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <Pulse className="h-[760px] rounded-[2rem]" />
          <Pulse className="h-[520px] rounded-[2rem]" />
        </div>
      </div>
    </main>
  );
}

export function BillingCheckoutLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Pulse className="h-9 w-32 rounded-xl" />
          <Pulse className="h-10 w-28 rounded-xl" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Pulse className="h-3 w-24" />
        <Pulse className="mt-3 h-10 w-64" />
        <Pulse className="mt-3 h-12 w-full max-w-2xl" />
        <Pulse className="mt-6 h-20 w-full rounded-2xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
            <Pulse className="h-7 w-48" />
            <Pulse className="mt-3 h-4 w-full max-w-2xl" />
            <Pulse className="mt-6 h-44 w-full rounded-2xl" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Pulse key={index} className="h-20 rounded-2xl" />
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Pulse className="h-28 rounded-2xl" />
              <Pulse className="h-28 rounded-2xl" />
            </div>
          </div>
          <div className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-6">
            <Pulse className="h-3 w-28" />
            <Pulse className="mt-4 h-7 w-44" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Pulse key={index} className="h-5 w-full" />
              ))}
            </div>
            <Pulse className="mt-5 h-20 w-full rounded-2xl" />
            <Pulse className="mt-5 h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function InvoiceLoading() {
  return (
    <main className="min-h-screen bg-[#faf9f1]">
      <div className="mx-auto max-w-[980px] px-5 py-6 sm:px-6 lg:px-8">
        <Pulse className="h-4 w-32" />
        <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-9">
          <div className="flex justify-between gap-6">
            <div className="space-y-3">
              <Pulse className="size-12 rounded-2xl" />
              <Pulse className="h-7 w-56" />
              <Pulse className="h-4 w-80 max-w-full" />
            </div>
            <Pulse className="h-36 w-56 rounded-2xl" />
          </div>
          <Pulse className="mt-8 h-28 w-full" />
          <Pulse className="mt-6 h-24 w-full" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <Pulse className="h-64 rounded-2xl" />
            <Pulse className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function InviteLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f1] px-5">
      <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 sm:p-10">
        <Pulse className="size-11 rounded-xl" />
        <Pulse className="mt-8 h-5 w-40" />
        <Pulse className="mt-3 h-10 w-full" />
        <Pulse className="mt-4 h-14 w-full" />
        <Pulse className="mt-7 h-12 w-full" />
      </div>
    </main>
  );
}
