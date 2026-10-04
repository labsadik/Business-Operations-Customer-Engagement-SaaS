"use client";
import RouteError from "@/components/route-error";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="Workspace could not load" description="Your workspace data could not be loaded. Try again without leaving the current session." backHref="/login" backLabel="Back to sign in" />;
}