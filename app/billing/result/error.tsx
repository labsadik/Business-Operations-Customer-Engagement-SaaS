"use client";
import RouteError from "@/components/route-error";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="Billing result could not load" description="We could not display the billing result. Your payment or subscription state is not changed by this screen." backHref="/dashboard" backLabel="Back to workspace" />;
}