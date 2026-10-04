"use client";
import RouteError from "@/components/route-error";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="Sign-in could not load" description="We could not prepare the sign-in page. Try again or return to the home page." />;
}