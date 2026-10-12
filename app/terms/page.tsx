import type { Metadata } from "next";
import LegalPageShell, { type LegalSection } from "@/components/legal-page-shell";
import { LEGAL_CONFIG } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Canvas Terms of Service."
};

const sections: LegalSection[] = [
  {
    id: "service",
    title: "1. The Canvas service",
    content: (
      <>
        <p>
          Canvas is a scheduling and collaboration product operated by AlgoQuit. A company can publish a public booking page, configure meeting types and availability, receive customer meeting requests, route those requests to eligible team members, and create a Google Meet and Calendar event after an eligible employee accepts a request.
        </p>
        <p>
          The public booking experience is company-specific. A visitor uses a company slug to reach that company&apos;s page, and the company&apos;s workspace and scheduling configuration determine the available meeting types, durations, dates, times, and routing behavior.
        </p>
      </>
    )
  },
  {
    id: "accounts",
    title: "2. Accounts and access",
    content: (
      <>
        <p>
          The current application uses Google sign-in rather than a separate password login flow. Company workspace access is checked against the user&apos;s company membership and workspace scope before a protected session is created.
        </p>
        <p>
          Employee access may be created through a company invitation. Invitation records are tied to a company and workspace and include an invited email, an expiration time, and an acceptance state.
        </p>
        <p>
          Customers who use a published company booking page sign in with Google before Canvas reveals live availability or accepts a booking request.
        </p>
      </>
    )
  },
  {
    id: "booking",
    title: "3. Bookings, meetings, and company rules",
    content: (
      <>
        <p>
          A booking request can include the company and workspace, customer account, meeting type, requested start and end times, requested duration, status, expiry, the employee handling the request, and the resulting meeting state. The application re-checks current workspace, plan, meeting-type, employee-eligibility, and calendar constraints during the workflow.
        </p>
        <p>
          An employee can accept or decline a request according to the current request state. Accepted requests can move through a meeting-creation state before the meeting is confirmed. The existing retry flow can recover temporary Google failures without creating a second meeting record for the same booking.
        </p>
        <p>
          The company&apos;s plan controls configured limits such as employee capacity, meeting capacity, maximum duration, concurrency, and validity period. Company and workspace settings remain scoped to the relevant tenant.
        </p>
      </>
    )
  },
  {
    id: "google",
    title: "4. Google integrations",
    content: (
      <>
        <p>
          Google sign-in requests the standard OpenID Connect identity scopes used by the current app: openid, email, and profile. Signing in does not automatically grant Google Calendar access.
        </p>
        <p>
          A scheduling member can separately connect Google with Calendar free/busy and Calendar event permissions. The current implementation checks the member&apos;s primary calendar for availability and creates the Calendar event with a Google Meet conference when a request is accepted.
        </p>
        <p>
          The application stores the connected Google account subject and email, the granted scopes, connection status, sync metadata, and an encrypted Google refresh token. Access tokens can also be cached server-side for scheduling calls.
        </p>
      </>
    )
  },
  {
    id: "billing",
    title: "5. Paid plans, billing, and invoices",
    content: (
      <>
        <p>
          Paid company plans are checked and created on the server. The checkout UI loads Razorpay&apos;s checkout script only when a user enters a paid-plan checkout flow, and the server verifies the payment response before activating the paid plan.
        </p>
        <p>
          Payment records include the company, plan, Razorpay order/payment identifiers, amount, currency, payment state, tax amounts, and timestamps. Invoice records preserve the billing and company details needed to display the invoice and its tax snapshot.
        </p>
        <p>
          The current repository does not define a separate public refund policy or other commercial terms. Those terms require owner confirmation before launch.
        </p>
      </>
    )
  },
  {
    id: "responsibilities",
    title: "6. User and company responsibilities",
    content: (
      <>
        <p>
          Use the service only with information and access you are authorized to use. Do not attempt to bypass company membership checks, scheduling limits, payment verification, or other access controls.
        </p>
        <p>
          Companies are responsible for configuring their own workspace, meeting types, employee membership, availability rules, Google scheduling connections, public booking state, and billing profile accurately.
        </p>
      </>
    )
  },
  {
    id: "changes",
    title: "7. Service changes and availability",
    content: (
      <>
        <p>
          The current implementation contains operational states for expired, cancelled, failed, retrying, and completed requests and meetings. Temporary external-service failures can therefore delay a final meeting outcome.
        </p>
        <p>
          Canvas may need to change implementation details, integrations, or plan configuration over time. The repository does not define a final contractual notice period, service-level commitment, termination procedure, or refund rule. Those are owner decisions that must be confirmed before launch.
        </p>
      </>
    )
  },
  {
    id: "owner-review",
    title: "8. Owner-review items before launch",
    content: (
      <>
        <p>
          Operating company: <strong className="text-slate-900">{LEGAL_CONFIG.companyName}</strong><br />Registered legal entity: <strong className="text-slate-900">{LEGAL_CONFIG.legalEntityName}</strong>
        </p>
        <p>
          Governing law and venue: <strong className="text-slate-900">{LEGAL_CONFIG.jurisdiction}</strong>
        </p>
        <p>
          Legal contact: <strong className="text-slate-900">{LEGAL_CONFIG.legalContact}</strong>
        </p>
        <p>
          Confirm the final pricing/refund language, termination language, liability language, intellectual-property terms, dispute-resolution terms, and any region-specific consumer or business terms with qualified counsel. These are deliberately not invented here because the repository does not establish them.
        </p>
      </>
    )
  }
];

export default function TermsPage() {
  return (
    <LegalPageShell
      kind="terms"
      title="Terms of Service"
      summary="The rules for using Canvas, based on the scheduling, authentication, company, meeting, Google, and billing behavior currently implemented in the product."
      sections={sections}
    />
  );
}
