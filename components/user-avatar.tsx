"use client";

import Image from "next/image";

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
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={String(size) + "px"}
          className="object-cover"
          unoptimized
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center">{initials}</span>
      )}
    </div>
  );
}
