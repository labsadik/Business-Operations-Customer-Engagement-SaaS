"use client";
import RouteError from "@/components/route-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Admin console could not load" description="The administrative workspace hit a recoverable error. Try again or return to sign in." backHref="/login" backLabel="Back to sign in" />;
}