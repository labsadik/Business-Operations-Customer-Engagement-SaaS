import { Types } from "mongoose";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getMongo } from "@/lib/mongodb";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { liveChatError, requireLiveChatScope } from "@/lib/live-chat";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePdfText(value: string) {
  return value.replace(/[^\x20-\xFF]/g, "?").replace(/\r/g, "");
}

function wrap(text: string, max = 92) {
  const words = safePdfText(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const scope = await requireLiveChatScope();
    if (!scope.entitlements.liveChatPdfExportEnabled) return jsonError("LIVE_CHAT_EXPORT_NOT_INCLUDED", 403);
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await getMongo();
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
    const conversation = await LiveChatConversation.findOne({
      ...tenant, _id: new Types.ObjectId(conversationId)
    }).lean();
    if (!conversation) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    const messages = await LiveChatMessage.find({
      ...tenant, conversationId: conversation._id
    }).sort({ createdAt: 1, _id: 1 }).limit(5000).lean();

    const pdf = await PDFDocument.create();
    pdf.setTitle("Live Chat Conversation");
    pdf.setAuthor("Conventus");
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const width = 612;
    const height = 792;
    const margin = 48;
    let page = pdf.addPage([width, height]);
    let y = height - margin;

    const ensureSpace = (amount: number) => {
      if (y - amount < margin) {
        page = pdf.addPage([width, height]);
        y = height - margin;
      }
    };
    const drawText = (text: string, size = 10, isBold = false, color = rgb(0.12, 0.16, 0.22)) => {
      page.drawText(safePdfText(text), { x: margin, y, size, font: isBold ? bold : font, color, maxWidth: width - margin * 2 });
      y -= size + 7;
    };

    drawText("Conventus · Live Chat Transcript", 18, true, rgb(0.08, 0.2, 0.45));
    drawText("Company: " + scope.company.name, 10, true);
    drawText("Customer: " + (conversation.customerName || "Anonymous customer"), 10, true);
    if (conversation.customerEmail) drawText("Email: " + conversation.customerEmail);
    if (conversation.customerPhone) drawText("Phone: " + conversation.customerPhone);
    drawText("Conversation started: " + new Date(conversation.createdAt).toLocaleString("en-IN", { timeZone: "UTC" }) + " UTC");
    drawText("Exported: " + new Date().toISOString());
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.82, 0.86, 0.92) });
    y -= 22;

    for (const item of messages) {
      const sender = item.senderType === "AGENT" ? "Company team" : (conversation.customerName || "Customer");
      const stamp = new Date(item.createdAt).toISOString().replace("T", " ").slice(0, 19) + " UTC";
      const lines = wrap(item.body);
      const blockHeight = 20 + lines.length * 14;
      ensureSpace(blockHeight);
      drawText(sender + "  ·  " + stamp, 9, true, item.senderType === "AGENT" ? rgb(0.1, 0.3, 0.65) : rgb(0.18, 0.45, 0.32));
      for (const line of lines) {
        ensureSpace(15);
        drawText(line, 10);
      }
      y -= 9;
    }
    const bytes = await pdf.save();
    const filename = `conventus-chat-${String(conversation._id)}.pdf`;
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
