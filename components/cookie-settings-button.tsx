"use client";

import type { ButtonHTMLAttributes } from "react";

export default function CookieSettingsButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={
        "rounded-lg underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950 hover:decoration-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
        className
      }
      onClick={() => {
        window.dispatchEvent(new CustomEvent("conventus:open-cookie-settings"));
      }}
      {...props}
    >
      Cookie settings
    </button>
  );
}
