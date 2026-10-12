import type { Metadata } from "next";
import LegalPageShell, { type LegalSection } from "@/components/legal-page-shell";
import { LEGAL_CONFIG } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Canvas Privacy Policy."
};

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "1. What this policy covers",
    content: (
      <>
        <p>
          This Privacy Policy explains how AlgoQuit operates the Canvas product and describes the information handling implemented in the service. It is intentionally limited to behavior that the repository currently implements; it does not invent a list of subprocessors, retention periods, legal bases, certifications, or other legal facts that are not established in the product.
        </p>
        <p>
          Canvas has separate public company pages, customer booking, company workspace access, Google integrations, and billing flows. Access and data remain scoped to the relevant company and workspace where the application enforces that boundary.
        </p>
      </>
    )
  },
  {
    id: "information",
    title: "2. Information the application stores",
    content: (
      <>
        <p>
          User records can contain an email address, name, profile image URL, role, Google subject, Google email, login timestamps, and active status. The application uses the Google account&apos;s verified email and profile information to identify the signed-in user.
        </p>
        <p>
          Booking records can contain the company and workspace, customer and employee identifiers, meeting type, requested start/end time, duration, request status, expiry, acceptance/decline state, retry state, and meeting-creation state. Meeting records can contain the customer and employee identifiers, start/end time, meeting status, Google Calendar event ID, Google Meet URI, and completion information.
        </p>
        <p>
          Company and workspace records can contain company name, slug, email, phone, website, description, address, tax information, public-booking state, workspace timezone, plan information, and company membership. Invitation records contain the invited email, company/workspace, role, expiry, and acceptance information.
        </p>
      </>
    )
  },
  {
    id: "google",
    title: "3. Google sign-in and Calendar access",
    content: (
      <>
        <p>
          For normal Google sign-in, the current app requests openid, email, and profile scopes. The callback uses Google&apos;s user information endpoint to obtain verified identity information needed to create or continue a Canvas session.
        </p>
        <p>
          Scheduling members can separately authorize Google Calendar scopes for free/busy checks and event creation. The application checks the primary calendar when deciding whether a slot is available and can create or remove the Calendar event associated with a confirmed meeting.
        </p>
        <p>
          Connected Google accounts are represented by a Google account record containing the Google subject, Google email, granted scopes, status and sync metadata, plus an encrypted refresh token. Access tokens may be held in a server-side Redis cache while the integration is in use.
        </p>
      </>
    )
  },
  {
    id: "booking-data",
    title: "4. Booking and meeting data",
    content: (
      <>
        <p>
          A public customer booking requires Google sign-in before live availability is shown or a request is accepted. The selected meeting type, date, time, duration, company, customer identity, and the resulting request/meeting state are used to execute the scheduling workflow.
        </p>
        <p>
          The confirmed meeting workflow can send attendee email addresses to Google Calendar when the event is created. The application also stores the resulting Google Calendar event ID and Google Meet URI so the confirmed meeting can be displayed and managed.
        </p>
        <p>
          Meeting and request history is stored as company-scoped activity records with event type, status transition, outcome, actor, employee, reason code, and timestamp so the application can show operational history to authorized users.
        </p>
      </>
    )
  },
  {
    id: "company-access",
    title: "5. Company memberships and invitations",
    content: (
      <>
        <p>
          Company workspace authorization is checked against active membership records and workspace scope. An employee invitation can be accepted through Google sign-in when the invited email matches the invitation.
        </p>
        <p>
          The current company-specific login page also displays active authorized member email addresses and pending invitation email addresses. Confirm with the owner before launch that this public display is intentional and appropriate for each company.
        </p>
      </>
    )
  },
  {
    id: "billing",
    title: "6. Billing, payments, and invoices",
    content: (
      <>
        <p>
          Paid plan checkout uses Razorpay. The current browser code loads Razorpay&apos;s checkout JavaScript only when a paid checkout is started, while the server creates and verifies orders and payments.
        </p>
        <p>
          Payment data stored by Canvas includes company and plan identifiers, provider order/payment IDs, amount, currency, tax values, status and payment timestamps. Invoice records preserve company and merchant snapshots, plan information, invoice numbers, billing periods, payment identifiers, and tax snapshots.
        </p>
        <p>
          The repository does not establish a public list of additional payment subprocessors or a separate retention schedule. Those details require owner confirmation.
        </p>
      </>
    )
  },
  {
    id: "cookies",
    title: "7. Cookies and browser storage",
    content: (
      <>
        <p>
          Canvas uses essential server-side cookies for authentication and protected workflow state. The primary session cookie is <code>canvas_session</code>; the application also uses <code>canvas_oauth_state</code> during Google OAuth and an application cookie named <code>canvas_admin_company</code> for platform-admin company scope. These are part of service/security flows and are not optional analytics cookies.
        </p>
        <p>
          The current session cookie is HTTP-only, uses a secure flag in production, uses SameSite=Lax, and is issued with a 30-day expiry. The Google OAuth state cookie is HTTP-only, uses SameSite=Lax, and expires after 10 minutes.
        </p>
        <p>
          The cookie-consent experience added with this policy stores only a small browser-local preference record under <code>canvas_cookie_consent</code>. It contains the consent version, timestamp, chosen consent action, and the fact that essential storage remains enabled. It does not contain an email, name, company ID, meeting data, or other sensitive personal information.
        </p>
        <p>
          There are currently no analytics or marketing technologies configured in the inspected application, so the consent dialog does not offer analytics or marketing toggles and the new consent flow does not initialize any optional tracker.
        </p>
      </>
    )
  },
  {
    id: "third-parties",
    title: "8. Current third-party integrations",
    content: (
      <>
        <p>
          The repository currently integrates with Google for identity and scheduling APIs, and with Razorpay for paid-plan checkout and payment verification. These integrations are used for the specific product flows described above.
        </p>
        <p>
          No advertising technology, analytics SDK, marketing tag, or tracking script was added as part of this work. No optional tracking category should be assumed from the existence of the consent banner.
        </p>
      </>
    )
  },
  {
    id: "security-retention",
    title: "9. Security and retention",
    content: (
      <>
        <p>
          The implementation applies access checks around sessions, company memberships, workspace scope, booking records, and billing data. Google refresh tokens are stored in an encrypted form. User-facing errors are intentionally kept separate from raw provider diagnostics in the booking flow.
        </p>
        <p>
          The repository does not define a complete customer-facing retention schedule or deletion timetable for every data class. This policy therefore makes no invented retention promise. Confirm retention periods, deletion workflows, legal holds, and any backup lifecycle with the owner and qualified counsel before launch.
        </p>
      </>
    )
  },
  {
    id: "choices",
    title: "10. Your choices",
    content: (
      <>
        <p>
          You can revisit cookie settings from the public site and policy footers. Clearing browser storage also clears the stored consent record, so the banner can appear again.
        </p>
        <p>
          Essential authentication/security storage cannot be disabled by the cookie settings UI because disabling it would interfere with sign-in and protected service behavior.
        </p>
        <p>
          The repository does not currently provide a dedicated self-service data-export, deletion, or privacy-request workflow. Owner-facing contact and response procedures must be confirmed before launch.
        </p>
      </>
    )
  },
  {
    id: "owner-review",
    title: "11. Owner-review items before launch",
    content: (
      <>
        <p>
          Operating company: <strong className="text-slate-900">{LEGAL_CONFIG.companyName}</strong><br />Registered legal entity: <strong className="text-slate-900">{LEGAL_CONFIG.legalEntityName}</strong>
        </p>
        <p>
          Legal/privacy contact: <strong className="text-slate-900">{LEGAL_CONFIG.legalContact}</strong>
        </p>
        <p>
          Confirm the final retention schedule, deletion/data-request process, jurisdiction-specific disclosures, legal bases where applicable, international-transfer language if applicable, and any final third-party/service-provider list with qualified counsel. None of those facts are fabricated here.
        </p>
      </>
    )
  }
];

export default function PrivacyPage() {
  return (
    <LegalPageShell
      kind="privacy"
      title="Privacy Policy"
      summary="What Canvas currently stores and how its Google, scheduling, membership, billing, cookie, and browser-storage flows use that information."
      sections={sections}
    />
  );
}
