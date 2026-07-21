import React, { useEffect, useState, useRef } from "react";
import { FileText, Download, X, AlertTriangle, RefreshCw } from "lucide-react";
import { getPdfDownloadUrl } from "../lib/pdfService";

// Dynamic hook to load PDF.js library and worker from CDN
export function preloadPdfJs() {
  if (typeof window === "undefined" || (window as any).pdfjsLib) {
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  script.async = true;
  script.onload = () => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  };
  document.body.appendChild(script);
}

export function usePdfJs() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ((window as any).pdfjsLib) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setLoaded(true);
    };
    script.onerror = () => {
      setError("Failed to load PDF rendering library.");
    };
    document.body.appendChild(script);
  }, []);

  return { loaded, error };
}

interface PdfPageProps {
  pdf: any;
  pageNum: number;
  scale?: number;
}

function PdfPage({ pdf, pageNum, scale = 1.2 }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let renderTask: any = null;

    async function renderPage() {
      try {
        setLoading(true);
        const page = await pdf.getPage(pageNum);
        if (!active) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
        
        if (active) {
          setLoading(false);
          console.log(`[PDF View Debug] Rendered page ${pageNum} successfully.`);
        }
      } catch (err: any) {
        console.error(`[PDF View Debug] Render error on page ${pageNum}:`, err);
        if (active) {
          setRenderError(err.message || String(err));
          setLoading(false);
        }
      }
    }

    renderPage();

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdf, pageNum, scale]);

  return (
    <div className="relative my-3 flex flex-col items-center bg-white dark:bg-slate-900 p-2 rounded-xl shadow-xs border border-slate-100 dark:border-slate-800/80">
      <div className="text-[10px] text-slate-400 font-bold mb-1 select-none">
        Page {pageNum} of {pdf.numPages}
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-950/50 rounded-xl min-h-[300px]">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-xs text-slate-500 font-semibold">Rendering Page {pageNum}...</span>
          </div>
        </div>
      )}
      {renderError ? (
        <div className="text-rose-500 text-xs p-4 border border-dashed border-rose-200 rounded-lg bg-rose-50/20">
          Failed to render page {pageNum}: {renderError}
        </div>
      ) : (
        <canvas ref={canvasRef} className="max-w-full h-auto rounded-md shadow-xs border border-slate-200/40 dark:border-slate-700/40" />
      )}
    </div>
  );
}

interface PdfViewerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const { loaded: pdfjsLoaded, error: pdfjsLoadError } = usePdfJs();
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    let xhr: XMLHttpRequest | null = null;

    async function resolveAndLoad() {
      try {
        setLoading(true);
        setError(null);
        setDownloadProgress(0);
        setStatusText("Resolving document path...");
        
        console.log(`[PDF View Debug] Starting resolution. Original URL/Path:`, url);
        
        // 1. Resolve to download URL if it is a storage path
        const dlUrl = await getPdfDownloadUrl(url);
        if (!active) return;
        setResolvedUrl(dlUrl);

        // 2. Wait for PDF.js to load
        if (!pdfjsLoaded) {
          if (pdfjsLoadError) {
            throw new Error(pdfjsLoadError);
          }
          setStatusText("Preparing PDF engine...");
          return; // Wait for next tick when pdfjsLoaded becomes true
        }

        // 3. Local File Caching (Check Cache Storage API)
        const cacheSupported = "caches" in window;
        let pdfBlob: Blob | null = null;

        if (cacheSupported) {
          try {
            const cache = await caches.open("student-pdf-cache");
            // Match using original url prop as stable unique version key
            const cachedResponse = await cache.match(url);
            if (cachedResponse) {
              console.log(`[PDF Cache] Local cache hit for stable key:`, url);
              setStatusText("Opening PDF from device storage...");
              pdfBlob = await cachedResponse.blob();
            }
          } catch (e) {
            console.warn(`[PDF Cache] Error checking local cache:`, e);
          }
        }

        // 4. Download if not cached
        if (!pdfBlob) {
          console.log(`[PDF View Debug] Downloading PDF from:`, dlUrl);
          setStatusText("Downloading… 0%");

          pdfBlob = await new Promise<Blob>((resolve, reject) => {
            xhr = new XMLHttpRequest();
            xhr.open("GET", dlUrl, true);
            xhr.responseType = "blob";

            xhr.onprogress = (event) => {
              if (event.lengthComputable && active) {
                const percent = Math.round((event.loaded / event.total) * 100);
                setDownloadProgress(percent);
                setStatusText(`Downloading… ${percent}%`);
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
              } else {
                reject(new Error(`Failed to download PDF. Status: ${xhr.status}`));
              }
            };

            xhr.onerror = () => {
              reject(new Error("Network error."));
            };

            xhr.send();
          });

          // Save to Local File Cache for subsequent instant accesses
          if (cacheSupported && pdfBlob && active) {
            try {
              const cache = await caches.open("student-pdf-cache");
              await cache.put(url, new Response(pdfBlob.slice(0), {
                headers: { "Content-Type": "application/pdf" }
              }));
              console.log(`[PDF Cache] Saved file to local storage:`, url);
            } catch (e) {
              console.warn(`[PDF Cache] Failed to write to local cache:`, e);
            }
          }
        }

        if (!active) return;
        setStatusText("Opening PDF…");

        const arrayBuffer = await pdfBlob!.arrayBuffer();
        const pdfjsLib = (window as any).pdfjsLib;
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        
        const pdfDoc = await loadingTask.promise;
        if (active) {
          setPdf(pdfDoc);
          setLoading(false);
          console.log(`[PDF View Debug] Loaded PDF with ${pdfDoc.numPages} pages.`);
        }
      } catch (err: any) {
        console.error(`[PDF View Debug] Error during load:`, err);
        if (active) {
          const msg = err.message || "";
          if (msg.includes("Failed to fetch") || msg.includes("Network error") || msg.includes("NetworkError")) {
            setError("Network error.");
          } else if (msg.includes("not found") || msg.includes("404")) {
            setError("PDF not found.");
          } else if (msg.includes("permission") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("Permission denied")) {
            setError("Permission denied.");
          } else if (msg.includes("Invalid PDF") || msg.includes("format") || msg.includes("PDFHeader") || msg.includes("invalid")) {
            setError("Invalid PDF.");
          } else {
            setError(msg || "Failed to retrieve Firebase download URL.");
          }
          setLoading(false);
        }
      }
    }

    resolveAndLoad();

    return () => {
      active = false;
      if (xhr) {
        xhr.abort();
      }
    };
  }, [pdfjsLoaded, pdfjsLoadError, url, retryTrigger]);

  const handleRetry = () => {
    setRetryTrigger(prev => prev + 1);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-900 text-white select-none">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-950 p-4 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-2.5 truncate">
          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
          <h2 className="text-sm font-bold truncate">{title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pdf && (
            <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2 py-1 text-xs font-semibold mr-2 border border-slate-700">
              <button
                onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
                className="hover:text-white text-slate-400 px-1.5 py-0.5 rounded transition cursor-pointer"
                title="Zoom Out"
              >
                -
              </button>
              <span>{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
                className="hover:text-white text-slate-400 px-1.5 py-0.5 rounded transition cursor-pointer"
                title="Zoom In"
              >
                +
              </button>
            </div>
          )}
          {resolvedUrl && (
            <a
              href={resolvedUrl}
              download={`${title.replace(/\s+/g, "_")}.pdf`}
              className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-all border border-slate-700 cursor-pointer"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewer Body */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-800 flex flex-col items-center">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <div className="relative flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <FileText className="absolute w-5 h-5 text-blue-400 animate-pulse" />
            </div>
            <div className="text-center flex flex-col items-center max-w-sm">
              <p className="font-bold text-sm text-slate-200">{statusText}</p>
              {downloadProgress > 0 && downloadProgress < 100 && (
                <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden mt-3 border border-slate-800">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-2">
                Downloading via direct secure Firebase channel. File is cached locally after completion.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-4">
            <div className="bg-rose-500/10 p-3 rounded-full border border-rose-500/20 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-base text-rose-400">{error}</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                We encountered an issue opening this chapter notes. Please check your internet connection or use the download button above.
              </p>
            </div>
            <button
              onClick={handleRetry}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Download</span>
            </button>
          </div>
        )}

        {!loading && !error && pdf && (
          <div className="w-full max-w-3xl flex flex-col gap-2">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage key={i + 1} pdf={pdf} pageNum={i + 1} scale={scale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
