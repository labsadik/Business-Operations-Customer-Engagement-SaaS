"use client";
import RouteError from "@/components/route-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Billing page could not load" description="We could not load the billing view. Try again without changing your subscription or payment state." backHref="/dashboard" backLabel="Back to workspace" />;
}