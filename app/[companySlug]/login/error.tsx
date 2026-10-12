"use client";
import RouteError from "@/components/route-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Company access could not load" description="We could not prepare this company access page. Try again or return to the public company page." backHref="/" backLabel="Back to Conventus" />;
}