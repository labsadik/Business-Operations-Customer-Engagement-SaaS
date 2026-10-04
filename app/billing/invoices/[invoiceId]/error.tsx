"use client";
import RouteError from "@/components/route-error";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="Invoice could not load" description="We could not prepare this invoice. Your historical billing record has not been changed." backHref="/dashboard?panel=billing" backLabel="Back to billing" />;
}