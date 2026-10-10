import LiveChatWidget from "@/components/live-chat-widget";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Chat · Conventus" };

export default async function EmbeddedLiveChatPage({
  params
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  return (
    <main className="h-dvh w-full overflow-hidden bg-transparent p-0">
      <LiveChatWidget companySlug={companySlug} />
    </main>
  );
}
