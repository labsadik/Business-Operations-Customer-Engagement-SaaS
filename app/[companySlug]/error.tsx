"use client";
import RouteError from "@/components/route-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Booking page could not load" description="The company booking page could not be prepared. Try again, or return to the home page." />;
}