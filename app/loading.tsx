import { Pulse } from "@/components/route-loading";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#faf9f1] px-5 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-9">
          <Pulse className="mx-auto h-9 w-32" />
          <Pulse className="mx-auto mt-6 h-6 w-64 max-w-full" />
          <Pulse className="mx-auto mt-3 h-4 w-96 max-w-full" />
          <Pulse className="mx-auto mt-8 h-11 w-32" />
        </div>
      </div>
    </main>
  );
}