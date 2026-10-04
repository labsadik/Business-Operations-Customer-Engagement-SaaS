"use client";

import { googleAvatarUrl } from "@/lib/avatar";

export default function UserAvatar({
  name,
  email,
  size = 40,
  className = "",
  image
}: {
  name: string;
  email?: string;
  size?: number;
  className?: string;
  image?: string | null;
}) {
  const safeImage = googleAvatarUrl(image);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "?";

  return (
    <div
      className={[
        "relative shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700",
        className
      ].join(" ")}
      style={{ width: size, height: size }}
      title={email || name}
      aria-label={name}
    >
      <span
        className="absolute inset-0 grid place-items-center"
        aria-hidden="true"
      >
        {initials}
      </span>

      {safeImage ? (
        // Google profile images are rendered directly so a provider-side image
        // response cannot be broken by the Next image optimizer/allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImage}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 size-full object-cover"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}
