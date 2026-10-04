"use client";
import RouteError from "@/components/route-error";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="Company profile could not load" description="We could not prepare the company profile screen. Try again or return to the workspace." backHref="/dashboard" backLabel="Back to workspace" />;
}