"use client";

import { useState, useRef, useCallback } from "react";
import { analyzeWarranty } from "@/lib/api";
import type { AnalysisResponse } from "@/lib/types";

/* ── Status styling map ──────────────────────────────── */
const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  SUPPORTED: {
    bg: "bg-green-bg",
    text: "text-green",
    border: "border-green/20",
    label: "Supported",
    icon: "✓",
  },
  CONTRADICTED: {
    bg: "bg-red-bg",
    text: "text-red",
    border: "border-red/20",
    label: "Contradicted",
    icon: "✕",
  },
  PARTIALLY_SUPPORTED: {
    bg: "bg-amber-bg",
    text: "text-amber",
    border: "border-amber/20",
    label: "Partially Supported",
    icon: "◐",
  },
  INSUFFICIENT_EVIDENCE: {
    bg: "bg-slate-light",
    text: "text-slate",
    border: "border-slate/20",
    label: "Insufficient Evidence",
    icon: "?",
  },
};

export default function Home() {
  /* ── State ─────────────────────────────────────── */
  const [file, setFile] = useState<File | null>(null);
  const [claim, setClaim] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  /* ── Handlers ──────────────────────────────────── */
  const handleFile = useCallback((f: File | null) => {
    if (f && f.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setIsDemoMode(false);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0] ?? null;
      handleFile(f);
    },
    [handleFile],
  );

  const loadDemo = useCallback(() => {
    setFile(null);
    setIsDemoMode(true);
    setClaim(
      "The salesperson said accidental damage like drops and spills is fully covered under the standard warranty for 2 years.",
    );
    setError(null);
    setResult(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!claim.trim()) {
      setError("Please enter a claim to verify.");
      return;
    }
    if (!file && !isDemoMode) {
      setError("Please upload a warranty PDF or use the demo.");
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await analyzeWarranty({
        user_claim: claim,
        file: file ?? undefined,
        demo_mode: isDemoMode || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [claim, file, isDemoMode]);

  const resetAll = useCallback(() => {
    setFile(null);
    setClaim("");
    setResult(null);
    setError(null);
    setIsDemoMode(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const statusStyle = result ? STATUS_STYLES[result.status] : null;

  /* ── Render ────────────────────────────────────── */
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ─────────────────────────────── */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-navy tracking-tight flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal/10 text-teal text-sm font-bold">
                LL
              </span>
              LabelLens
            </h1>
            <p className="text-sm text-slate mt-0.5">
              Understand the fine print.
            </p>
          </div>
          {(result || file || claim) && (
            <button
              onClick={resetAll}
              className="text-sm text-slate hover:text-navy transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      {/* ── Main ───────────────────────────────── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* One-liner */}
        <section className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-navy">
            Verify warranty promises in seconds
          </h2>
          <p className="text-slate max-w-lg mx-auto">
            Upload a warranty document and describe what you were told. LabelLens
            checks whether the promise matches the written terms.
          </p>
        </section>

        {/* ── Upload area ────────────────────── */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`
            relative rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200
            ${dragActive ? "border-teal bg-teal-bg scale-[1.01]" : "border-border hover:border-teal/40"}
            ${isDemoMode ? "border-teal/40 bg-teal-bg/50" : ""}
          `}
        >
          {isDemoMode ? (
            <div className="space-y-1 animate-fade-in">
              <p className="text-sm font-medium text-teal">
                ✦ Demo mode active
              </p>
              <p className="text-xs text-slate">
                Using a fictional laptop warranty. Upload your own PDF to switch
                to real analysis.
              </p>
            </div>
          ) : file ? (
            <div className="flex items-center justify-center gap-3 animate-fade-in">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-bg text-teal">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-navy truncate max-w-xs">
                  {file.name}
                </p>
                <p className="text-xs text-slate">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="ml-2 text-slate hover:text-red transition-colors text-lg"
                aria-label="Remove file"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-teal-bg text-teal mx-auto">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-navy font-medium">
                  Drop a warranty PDF here, or{" "}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-teal hover:underline font-medium"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-slate mt-1">PDF only · Max 10 MB</p>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Demo button */}
        {!isDemoMode && !file && (
          <div className="text-center">
            <button
              onClick={loadDemo}
              className="inline-flex items-center gap-1.5 text-sm text-teal hover:text-teal/80 font-medium transition-colors"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Try Demo
            </button>
          </div>
        )}

        {/* ── Claim textarea ─────────────────── */}
        <div className="space-y-1.5">
          <label
            htmlFor="claim"
            className="block text-sm font-medium text-navy"
          >
            What were you promised?
          </label>
          <textarea
            id="claim"
            rows={3}
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="e.g. 'The salesperson said accidental damage is covered for 2 years…'"
            className="w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-navy placeholder:text-slate/50 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition-all resize-none"
          />
        </div>

        {/* ── Error ──────────────────────────── */}
        {error && (
          <div className="rounded-lg bg-red-bg border border-red/20 px-4 py-3 text-sm text-red animate-fade-in">
            {error}
          </div>
        )}

        {/* ── Submit button ──────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`
            w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all duration-200
            ${loading ? "bg-teal/60 cursor-not-allowed" : "bg-teal hover:bg-teal/90 active:scale-[0.99] shadow-sm hover:shadow-md"}
          `}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-4 w-4">
                <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-white/40" />
                <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-white/30 border-t-white animate-spin" />
              </span>
              Analyzing…
            </span>
          ) : (
            "Verify My Claim"
          )}
        </button>

        {/* ── Results panel ──────────────────── */}
        {result && statusStyle && (
          <section className="animate-fade-in space-y-4">
            {/* Demo badge */}
            {result.analysis_mode === "demo" && (
              <div className="rounded-lg bg-amber-bg border border-amber/20 px-4 py-2 text-xs text-amber font-medium text-center">
                ⚠ Demo results — using a fictional warranty document
              </div>
            )}

            {/* Status header */}
            <div
              className={`rounded-xl border ${statusStyle.border} ${statusStyle.bg} px-5 py-4`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${statusStyle.text} bg-white/60`}
                >
                  {statusStyle.icon}
                </span>
                <div className="space-y-1">
                  <h3
                    className={`text-lg font-semibold ${statusStyle.text}`}
                  >
                    {statusStyle.label}
                  </h3>
                  <p className="text-sm text-navy/80">{result.summary}</p>
                </div>
              </div>
            </div>

            {/* Evidence */}
            {result.evidence.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate">
                  Evidence
                </h4>
                <div className="space-y-2">
                  {result.evidence.map((ev, i) => (
                    <blockquote
                      key={i}
                      className="border-l-2 border-teal/30 pl-4 py-2 bg-slate-light rounded-r-lg"
                    >
                      <p className="text-sm text-navy/90 italic leading-relaxed">
                        &ldquo;{ev.quote}&rdquo;
                      </p>
                      {ev.page != null && (
                        <p className="text-xs text-slate mt-1.5 font-medium">
                          Page {ev.page}
                        </p>
                      )}
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up questions */}
            {result.follow_up_questions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate">
                  Suggested Follow-ups
                </h4>
                <ul className="space-y-1.5">
                  {result.follow_up_questions.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-navy/80"
                    >
                      <span className="text-teal mt-0.5 text-xs">→</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="border-t border-border py-4 text-center text-xs text-slate">
        LabelLens · Hackathon MVP · Not legal advice
      </footer>
    </div>
  );
}
