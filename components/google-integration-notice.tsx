import { CalendarDays, Info, Video } from "lucide-react";

export default function GoogleIntegrationNotice({
  mode
}: {
  mode: "employee" | "customer";
}) {
  if (mode === "customer") {
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4" role="note">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-700" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-950">Google sign-in is separate from Calendar access</p>
            <p className="mt-1 text-xs leading-5 text-blue-900/75">
              Customers use Google sign-in to identify the account attached to a booking request. The customer booking flow does not request Calendar access. Your request is only a request until an eligible employee accepts it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4" role="note">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-700" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-950">Before you connect Google</p>
          <p className="mt-1 text-xs leading-5 text-blue-900/75">
            Employees and scheduling participants may need to connect Google before Conventus can use their calendar availability or create meeting events. The current Google connection asks for identity (openid, email, profile) plus Calendar free/busy and Calendar event access. It is used to check availability and, after an accepted request, create the Calendar event with the Google Meet conference.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-white/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-3.5 text-blue-700" />
                <p className="text-[11px] font-semibold text-slate-900">Google Calendar</p>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-600">Used for primary-calendar free/busy checks and Calendar event creation in the existing meeting workflow.</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Video className="size-3.5 text-blue-700" />
                <p className="text-[11px] font-semibold text-slate-900">Google Meet</p>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-600">The meeting workflow requests a Meet conference when the accepted Calendar event is created; the link is not treated as confirmed before acceptance.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}