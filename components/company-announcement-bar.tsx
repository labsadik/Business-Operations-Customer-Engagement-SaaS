import { Megaphone } from "lucide-react";

export default function CompanyAnnouncementBar({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <section
      className="mt-5 overflow-hidden rounded-[1.5rem] border border-amber-200 bg-[#fbf4c9]/70 shadow-sm"
      aria-labelledby="company-announcement-title"
    >
      <div className="flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-4">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-2xl border border-amber-200 bg-white/80 text-amber-700"
          aria-hidden="true"
        >
          <Megaphone className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
              Company update
            </span>
            <span className="text-[10px] text-amber-700/70">Announcement</span>
          </div>
          <h2 id="company-announcement-title" className="mt-1 text-sm font-semibold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}
