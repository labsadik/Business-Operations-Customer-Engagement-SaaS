import { Types } from "mongoose";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getMongo } from "@/lib/mongodb";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { User } from "@/models/user";
import { liveChatError, requireLiveChatScope } from "@/lib/live-chat";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const AVATAR_LIMIT_BYTES = 512 * 1024;
const NAVY = rgb(0.07, 0.14, 0.28);
const BLUE = rgb(0.12, 0.34, 0.72);
const PALE_BLUE = rgb(0.91, 0.95, 1);
const PALE_GRAY = rgb(0.96, 0.97, 0.985);
const BORDER = rgb(0.86, 0.89, 0.93);
const TEXT = rgb(0.13, 0.17, 0.24);
const MUTED = rgb(0.39, 0.44, 0.52);

function safePdfText(value: string) {
  return value.replace(/[\r\u0000-\u0009\u000B-\u001F\u007F]/g, " ").replace(/[^\x20-\xFF]/g, "?").trim();
}

function truncate(value: string, max: number) {
  const safe = safePdfText(value);
  return safe.length > max ? safe.slice(0, max - 3) + "..." : safe;
}

function wrapText(value: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number) {
  const result: string[] = [];
  const paragraphs = safePdfText(value).split(/\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      // Split exceptionally long unbroken tokens/URLs without allowing text outside the bubble.
      let chunk = "";
      for (const character of word) {
        const next = chunk + character;
        if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
          result.push(chunk);
          chunk = character;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    if (line) result.push(line);
  }
  return result.length ? result : [""];
}

async function limitedImageBytes(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const announcedLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > AVATAR_LIMIT_BYTES) {
    await response.body.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > AVATAR_LIMIT_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchGoogleAvatar(pdf: PDFDocument, imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    // Only fetch Google's public profile-image CDN; never turn a PDF export into an SSRF proxy.
    if (url.protocol !== "https:" ||
        !(url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) ||
        url.username || url.password) return null;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(1800),
      headers: { accept: "image/png, image/jpeg" },
      redirect: "error"
    });
    if (!response.ok) return null;
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (mime !== "image/png" && mime !== "image/jpeg") {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await limitedImageBytes(response);
    if (!bytes?.byteLength) return null;
    return mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    // Avatars are best-effort. Transcript export must still work if Google is unavailable.
    return null;
  }
}

function formatDate(value: Date | string | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short"
  }) + " IST";
}

function initials(value: string) {
  const words = safePdfText(value).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "V").slice(0, 2)).toUpperCase();
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const scope = await requireLiveChatScope();
    if (!scope.entitlements.liveChatPdfExportEnabled) return jsonError("LIVE_CHAT_EXPORT_NOT_INCLUDED", 403);
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await getMongo();

    const tenant = {
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    };
    const conversation = await LiveChatConversation.findOne({
      ...tenant,
      _id: new Types.ObjectId(conversationId),
      expiresAt: { $gt: new Date() }
    }).lean();
    if (!conversation) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);

    const messages = await LiveChatMessage.find({
      ...tenant,
      conversationId: conversation._id,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: 1, _id: 1 }).limit(5000).lean();

    const agentIds = [...new Set(
      messages
        .filter((message) => message.senderType === "AGENT" && message.senderUserId)
        .map((message) => String(message.senderUserId))
    )];
    const agents = agentIds.length
      ? await User.find({ _id: { $in: agentIds } }).select("_id name image").lean()
      : [];
    const agentById = new Map(agents.map((agent) => [
      String(agent._id),
      { name: agent.name || "Support agent", image: agent.image || "" }
    ]));

    const pdf = await PDFDocument.create();
    pdf.setTitle("Conventus Live Chat Transcript - " + (conversation.customerName || "Anonymous visitor"));
    pdf.setAuthor("Conventus");
    pdf.setSubject("Customer support conversation " + String(conversation._id));
    pdf.setCreator("Conventus Live Chat");
    pdf.setCreationDate(new Date());
    pdf.setModificationDate(new Date());

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const avatarImages = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
    const avatarEntries = agents
      .filter((agent) => agent.image && agent._id)
      .slice(0, 10);
    const loadedAvatars = await Promise.all(avatarEntries.map(async (agent) => ({
      id: String(agent._id),
      image: await fetchGoogleAvatar(pdf, agent.image || "")
    })));
    for (const entry of loadedAvatars) {
      if (entry.image) avatarImages.set(entry.id, entry.image);
    }

    const pages: ReturnType<typeof pdf.addPage>[] = [];
    let page: ReturnType<typeof pdf.addPage>;
    let y = PAGE_HEIGHT - MARGIN;

    const addPage = (first = false) => {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      page.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - (first ? 138 : 52),
        width: PAGE_WIDTH,
        height: first ? 138 : 52,
        color: NAVY
      });
      if (first) {
        page.drawText("CONVENTUS  /  CUSTOMER SUPPORT", {
          x: MARGIN, y: PAGE_HEIGHT - 38, size: 9, font: bold, color: rgb(0.77, 0.85, 1)
        });
        page.drawText("Conversation transcript", {
          x: MARGIN, y: PAGE_HEIGHT - 77, size: 22, font: bold, color: rgb(1, 1, 1)
        });
        page.drawText("Case ID: " + String(conversation._id), {
          x: MARGIN, y: PAGE_HEIGHT - 106, size: 8.5, font, color: rgb(0.86, 0.9, 0.98)
        });
        page.drawText("PRIVATE SUPPORT RECORD", {
          x: PAGE_WIDTH - MARGIN - 142, y: PAGE_HEIGHT - 106, size: 8, font: bold, color: rgb(0.86, 0.9, 0.98)
        });
        y = PAGE_HEIGHT - 164;
      } else {
        page.drawText("CONVENTUS  /  LIVE CHAT TRANSCRIPT", {
          x: MARGIN, y: PAGE_HEIGHT - 32, size: 9, font: bold, color: rgb(0.86, 0.9, 0.98)
        });
        page.drawText("Case " + String(conversation._id), {
          x: PAGE_WIDTH - MARGIN - 160, y: PAGE_HEIGHT - 32, size: 8, font, color: rgb(0.86, 0.9, 0.98)
        });
        y = PAGE_HEIGHT - 78;
      }
    };

    const ensureSpace = (amount: number) => {
      if (y - amount < MARGIN + 28) addPage(false);
    };

    const drawParagraph = (value: string, x: number, baseline: number, size: number, chosenFont: typeof font, color: ReturnType<typeof rgb>, maxWidth: number) => {
      const lines = wrapText(value, chosenFont, size, maxWidth);
      for (const line of lines) {
        page.drawText(line, { x, y: baseline, size, font: chosenFont, color, maxWidth });
        baseline -= size + 3;
      }
      return baseline;
    };

    addPage(true);

    const visitorName = conversation.customerName || "Anonymous visitor";
    const statusLabel = conversation.status === "CLOSED" ? "Closed" : "Open";
    const location = [conversation.geoCity, conversation.geoRegion, conversation.geoCountry].filter(Boolean).join(", ") || "Unavailable";
    const device = [conversation.deviceType || "DESKTOP", conversation.os, conversation.browser].filter(Boolean).join(" / ") || "Unavailable";
    const sourcePage = conversation.referrer || conversation.originHost || "Unavailable";
    const visitorDetails: [string, string][] = [
      ["CUSTOMER / VISITOR", visitorName],
      ["CONVERSATION STATUS", statusLabel],
      ["EMAIL", conversation.customerEmail || "Not provided"],
      ["PHONE", conversation.customerPhone || "Not provided"],
      ["LOCATION", location],
      ["DEVICE / BROWSER", device],
      ["IP ADDRESS", conversation.ipDisplay || "Unavailable"],
      ["STARTED", formatDate(conversation.createdAt)],
      ["LAST ACTIVITY", formatDate(conversation.lastMessageAt)],
      ["SOURCE / REFERRER", sourcePage]
    ];

    page.drawText("VISITOR DETAILS", { x: MARGIN, y, size: 9, font: bold, color: BLUE });
    y -= 17;
    const rows = Math.ceil(visitorDetails.length / 2);
    const cardHeight = rows * 39 + 18;
    page.drawRectangle({
      x: MARGIN, y: y - cardHeight, width: PAGE_WIDTH - MARGIN * 2, height: cardHeight,
      color: PALE_GRAY, borderColor: BORDER, borderWidth: 0.8
    });
    for (let i = 0; i < visitorDetails.length; i++) {
      const column = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + 14 + column * 264;
      const rowTop = y - 15 - row * 39;
      page.drawText(visitorDetails[i][0], { x, y: rowTop, size: 7, font: bold, color: MUTED });
      drawParagraph(truncate(visitorDetails[i][1], 74), x, rowTop - 13, 9, font, TEXT, 245);
    }
    y -= cardHeight + 25;
    page.drawText("MESSAGE HISTORY", { x: MARGIN, y, size: 9, font: bold, color: BLUE });
    y -= 22;

    const visitorLabel = visitorName;
    for (const item of messages) {
      const isAgent = item.senderType === "AGENT";
      const agent = item.senderUserId ? agentById.get(String(item.senderUserId)) : undefined;
      const sender = isAgent ? agent?.name || "Support agent" : visitorLabel;
      const timestamp = formatDate(item.createdAt);
      const bodyLines = wrapText(item.body, font, 9.5, 394);
      const bubbleWidth = Math.min(434, Math.max(145, Math.max(...bodyLines.map((line) => font.widthOfTextAtSize(line, 9.5))) + 22));
      const bubbleHeight = Math.max(34, 18 + bodyLines.length * 13);
      const blockHeight = bubbleHeight + 35;
      ensureSpace(blockHeight);

      const bubbleX = isAgent
        ? PAGE_WIDTH - MARGIN - 30 - bubbleWidth
        : MARGIN + 30;
      const labelWidth = Math.min(245, bubbleWidth);
      const label = truncate(sender + (isAgent ? "  /  Support agent" : "  /  Visitor"), 80);
      page.drawText(label, {
        x: bubbleX, y, size: 8.5, font: bold, color: isAgent ? BLUE : TEXT, maxWidth: labelWidth
      });
      const timeWidth = font.widthOfTextAtSize(timestamp, 7.5);
      page.drawText(timestamp, {
        x: isAgent ? Math.max(bubbleX, PAGE_WIDTH - MARGIN - 30 - timeWidth) : bubbleX,
        y: y - 11, size: 7.5, font, color: MUTED, maxWidth: bubbleWidth
      });

      const bubbleTop = y - 17;
      const bubbleBottom = bubbleTop - bubbleHeight;
      page.drawRectangle({
        x: bubbleX, y: bubbleBottom, width: bubbleWidth, height: bubbleHeight,
        color: isAgent ? PALE_BLUE : PALE_GRAY,
        borderColor: isAgent ? rgb(0.78, 0.85, 0.97) : BORDER,
        borderWidth: 0.6
      });

      const senderUserId = item.senderUserId ? String(item.senderUserId) : "";
      const avatarImage = isAgent && senderUserId ? avatarImages.get(senderUserId) : undefined;
      const avatarX = isAgent ? PAGE_WIDTH - MARGIN - 22 : MARGIN;
      const avatarY = bubbleTop - 20;
      if (avatarImage) {
        const dims = avatarImage.scaleToFit(20, 20);
        page.drawImage(avatarImage, { x: avatarX, y: avatarY, width: dims.width, height: dims.height });
        page.drawRectangle({ x: avatarX, y: avatarY, width: 20, height: 20, borderColor: BORDER, borderWidth: 0.5 });
      } else {
        const avatarColor = isAgent ? BLUE : rgb(0.43, 0.49, 0.59);
        page.drawCircle({ x: avatarX + 10, y: avatarY + 10, size: 10, color: avatarColor });
        page.drawText(initials(sender), {
          x: avatarX + 2, y: avatarY + 6.5, size: 7, font: bold,
          color: rgb(1, 1, 1), maxWidth: 16
        });
      }

      let lineY = bubbleTop - 14;
      for (const line of bodyLines) {
        page.drawText(line, { x: bubbleX + 11, y: lineY, size: 9.5, font, color: TEXT, maxWidth: bubbleWidth - 22 });
        lineY -= 13;
      }
      y = bubbleBottom - 17;
    }

    if (!messages.length) {
      page.drawText("No messages were found for this conversation.", { x: MARGIN, y, size: 10, font, color: MUTED });
      y -= 20;
    }

    pages.forEach((currentPage, index) => {
      currentPage.drawLine({
        start: { x: MARGIN, y: 30 },
        end: { x: PAGE_WIDTH - MARGIN, y: 30 },
        thickness: 0.65,
        color: BORDER
      });
      currentPage.drawText("Confidential customer support record  |  Exported " + formatDate(new Date()), {
        x: MARGIN, y: 17, size: 7, font, color: MUTED, maxWidth: PAGE_WIDTH - MARGIN * 2 - 100
      });
      currentPage.drawText("Page " + (index + 1) + " of " + pages.length, {
        x: PAGE_WIDTH - MARGIN - 74, y: 17, size: 7, font, color: MUTED, maxWidth: 74
      });
    });

    const bytes = await pdf.save();
    const safeName = (conversation.customerName || "visitor").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "visitor";
    const filename = `conventus-live-chat-${safeName}-${String(conversation._id).slice(-8)}.pdf`;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store, private"
      }
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_EXPORT_FAILED");
    return jsonError(code, status);
  }
}
