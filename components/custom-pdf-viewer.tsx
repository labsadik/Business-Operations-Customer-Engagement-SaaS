"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  ScanLine
} from "lucide-react";

type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PdfPageProxy = import("pdfjs-dist").PDFPageProxy;

type CustomPdfViewerProps = {
  src: string;
  fileName: string;
};

const PDF_WORKER_SRC = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function friendlyPdfError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "PasswordException") return "This PDF is password protected and cannot be opened here.";
  if (name === "InvalidPDFException" || name === "MissingPDFException" || name === "FormatError") {
    return "This PDF appears to be damaged or uses a format that could not be read.";
  }
  return "We couldn't open this PDF. Check your connection or download the original file to try again.";
}

export default function CustomPdfViewer({ src, fileName }: CustomPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);
  const [frameWidth, setFrameWidth] = useState(0);
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    const loadDocument = async () => {
      try {
        // Keep PDF.js out of the server render and load it only when a PDF is opened.
        const pdfjs = await import("pdfjs-dist");
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        const task = pdfjs.getDocument({
          url: src,
          withCredentials: true,
          disableRange: false,
          rangeChunkSize: 64 * 1024
        });
        loadingTask = task;
        const pdf = await task.promise;
        if (!active) {
          await task.destroy();
          return;
        }
        setDocumentProxy(pdf);
        setPageCount(pdf.numPages);
        setLoadingDocument(false);
      } catch (reason) {
        if (!active) return;
        setError(friendlyPdfError(reason));
        setLoadingDocument(false);
      }
    };

    void loadDocument();
    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
    };
  }, [src, retryToken]);

  useEffect(() => {
    const frame = pageFrameRef.current;
    if (!frame) return;
    const updateWidth = () => setFrameWidth(Math.floor(frame.clientWidth));
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current || frameWidth < 1 || error) return;
    let cancelled = false;
    let renderTask: ReturnType<PdfPageProxy["render"]> | null = null;

    const renderPage = async () => {
      setLoadingPage(true);
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const safePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const pageScale = fitWidth
          ? Math.max(0.4, Math.min(1.5, (frameWidth - 32) / baseViewport.width))
          : zoom / 100;
        const viewport = page.getViewport({ scale: pageScale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context) throw new Error("PDF_CANVAS_UNAVAILABLE");

        canvas.width = Math.ceil(viewport.width * safePixelRatio);
        canvas.height = Math.ceil(viewport.height * safePixelRatio);
        canvas.style.width = Math.ceil(viewport.width) + "px";
        canvas.style.height = Math.ceil(viewport.height) + "px";
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: safePixelRatio === 1 ? undefined : [safePixelRatio, 0, 0, safePixelRatio, 0, 0],
          intent: "display"
        });
        await renderTask.promise;
      } catch (reason) {
        const name = reason && typeof reason === "object" && "name" in reason ? String(reason.name) : "";
        if (!cancelled && name !== "RenderingCancelledException") {
          setError(friendlyPdfError(reason));
        }
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom, fitWidth, frameWidth, error]);

  const changePage = (nextPage: number) => {
    setPageNumber(Math.min(pageCount, Math.max(1, nextPage)));
  };

  const changeZoom = (delta: number) => {
    setFitWidth(false);
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  };

  return (
    <section className="flex h-full min-h-[320px] w-full flex-col overflow-hidden bg-white" aria-label={"PDF viewer: " + fileName}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changePage(pageNumber - 1)}
            disabled={loadingDocument || pageNumber <= 1 || Boolean(error)}
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Previous PDF page"
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <label className="flex items-center gap-2 px-1 text-xs text-slate-600">
            <span className="hidden sm:inline">Page</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, pageCount)}
              value={pageNumber}
              disabled={loadingDocument || !pageCount || Boolean(error)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= pageCount) setPageNumber(next);
              }}
              className="h-8 w-14 rounded-lg border border-slate-200 bg-white text-center text-xs font-semibold tabular-nums text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
              aria-label="Current PDF page"
            />
            <span className="whitespace-nowrap text-slate-400">of {pageCount || "—"}</span>
          </label>
          <button
            type="button"
            onClick={() => changePage(pageNumber + 1)}
            disabled={loadingDocument || pageNumber >= pageCount || Boolean(error)}
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Next PDF page"
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changeZoom(-ZOOM_STEP)}
            disabled={loadingDocument || (zoom <= MIN_ZOOM && !fitWidth) || Boolean(error)}
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-medium tabular-nums text-slate-600">{fitWidth ? "Fit" : zoom + "%"}</span>
          <button
            type="button"
            onClick={() => changeZoom(ZOOM_STEP)}
            disabled={loadingDocument || (zoom >= MAX_ZOOM && !fitWidth) || Boolean(error)}
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setFitWidth(true)}
            disabled={loadingDocument || fitWidth || Boolean(error)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            title="Fit page to viewer width"
          >
            <ScanLine className="size-3.5" /><span className="hidden sm:inline">Fit width</span>
          </button>
        </div>
      </div>

      <div ref={pageFrameRef} className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-slate-100 p-4 sm:p-6">
        {(loadingDocument || loadingPage) && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90" aria-live="polite">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
              <LoaderCircle className="size-4 animate-spin text-blue-600" />
              {loadingDocument ? "Opening secure PDF…" : "Rendering page…"}
            </div>
          </div>
        )}
        {error ? (
          <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center px-5 text-center" role="alert">
            <span className="grid size-12 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
              <FileWarning className="size-6" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-900">PDF preview unavailable</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{error}</p>
            <a href={src.replace("?inline=1", "")} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700">
              <Download className="size-3.5" /> Download original
            </a>
            <button type="button" onClick={() => { setLoadingDocument(true); setLoadingPage(false); setDocumentProxy(null); setPageCount(0); setPageNumber(1); setError(""); setRetryToken((value) => value + 1); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
              <RotateCcw className="size-3.5" /> Retry preview
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={"Page " + pageNumber + " of " + pageCount + " of " + fileName}
            className="block max-w-none rounded-sm bg-white shadow-md ring-1 ring-slate-900/5"
          />
        )}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500 sm:px-4">
        <span className="truncate">{fileName}</span>
        <span className="shrink-0">{pageCount ? pageCount + (pageCount === 1 ? " page" : " pages") : "PDF document"}</span>
      </footer>
    </section>
  );
}
