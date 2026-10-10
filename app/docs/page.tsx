import type { Metadata } from "next";
import PublicDocs from "@/components/public-docs";
import { getConfiguredPublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-static";

const title = "Conventus Documentation · Enterprise Scheduling, Tasks, Vault & Live Chat";
const description = "Learn how to use Conventus: configure client scheduling, assign availability-aware team tasks, store enterprise documents in the private vault, and engage website visitors with real-time live chat.";
const publicOrigin = getConfiguredPublicOrigin();
const canonicalUrl = publicOrigin ? new URL("/docs", publicOrigin).toString() : "/docs";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    title,
    description,
    siteName: "Conventus",
    locale: "en_US"
  },
  twitter: {
    card: "summary",
    title,
    description
  },
  robots: { index: true, follow: true },
  keywords: [
    "Conventus documentation",
    "client scheduling",
    "meeting acceptance",
    "team task management",
    "company cloud vault",
    "live chat widget",
    "customer support software",
    "workspace security"
  ]
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": canonicalUrl + "#software",
      name: "Conventus",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: publicOrigin?.toString() ?? canonicalUrl,
      description,
      featureList: [
        "Client scheduling with employee acceptance",
        "Availability-aware team task management",
        "Private company document vault",
        "Embeddable website live chat and customer support",
        "Company and workspace scoped access controls"
      ]
    },
    {
      "@type": "TechArticle",
      "@id": canonicalUrl + "#article",
      headline: title,
      description,
      inLanguage: "en",
      mainEntityOfPage: canonicalUrl,
      about: { "@id": canonicalUrl + "#software" },
      articleSection: [
        "Getting started",
        "Client scheduling and meeting acceptance",
        "Team task management and delegation",
        "Private Company Vault",
        "Public Live Chat",
        "Security and multi-tenancy"
      ]
    },
    {
      "@type": "FAQPage",
      "@id": canonicalUrl + "#faq-schema",
      mainEntity: [
        {
          "@type": "Question",
          name: "When is a client meeting confirmed in Conventus?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A meeting request remains pending until an eligible employee explicitly accepts it and the configured confirmation workflow completes."
          }
        },
        {
          "@type": "Question",
          name: "Can teams organize company documents in Conventus?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The Company Vault provides a workspace-scoped library for organizing company documents and previewing supported files such as PDFs."
          }
        },
        {
          "@type": "Question",
          name: "Can website visitors use Conventus Live Chat without a Conventus account?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Visitors can start a website chat without creating a Conventus account when the company enables the widget and allows the website domain."
          }
        },
        {
          "@type": "Question",
          name: "How does Conventus control feature access?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Feature access depends on the company plan, the active workspace membership and the permissions associated with a user's role."
          }
        }
      ]
    }
  ]
};

export default function DocumentationPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <PublicDocs />
    </>
  );
}
