"use client";
import RouteError from "@/components/route-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Invitation could not load" description="We could not prepare this invitation. Try again or return to Conventus." />;
}