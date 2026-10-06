export type PlatformAnnouncementClientItem = {
  id: string;
  title: string;
  message: string;
  audience?: string;
  publishedAt?: string | null;
  createdAt?: string;
};

export function parsePlatformAnnouncementResponse(body: unknown): PlatformAnnouncementClientItem[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("ANNOUNCEMENTS_INVALID_RESPONSE");
  }

  const payload = body as { ok?: unknown; data?: unknown };
  if (payload.ok !== true || !Array.isArray(payload.data)) {
    throw new Error("ANNOUNCEMENTS_INVALID_RESPONSE");
  }

  return payload.data.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      !candidate.id ||
      typeof candidate.title !== "string" ||
      typeof candidate.message !== "string"
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      title: candidate.title,
      message: candidate.message,
      audience: typeof candidate.audience === "string" ? candidate.audience : undefined,
      publishedAt:
        typeof candidate.publishedAt === "string" || candidate.publishedAt === null
          ? candidate.publishedAt
          : undefined,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : undefined
    }];
  });
}

export function visiblePlatformAnnouncements(
  items: PlatformAnnouncementClientItem[],
  dismissed: ReadonlySet<string>
) {
  return items.filter((item) => !dismissed.has(item.id));
}
