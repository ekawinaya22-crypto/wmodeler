import React, { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

export const STARTUP_AD_URL = 'https://asiafilm.org/4/34779a6939aa588bf6354dffc2e0d044';

interface StartupAdModalProps {
  open: boolean;
  onDismiss: () => void;
}

export const StartupAdModal: React.FC<StartupAdModalProps> = ({ open, onDismiss }) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      style={{
        paddingTop: 'max(12px, var(--safe-top))',
        paddingBottom: 'max(12px, var(--safe-bottom))',
        paddingLeft: 'max(12px, var(--safe-left))',
        paddingRight: 'max(12px, var(--safe-right))',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Iklan Sponsor Awal"
    >
      <div className="w-full max-w-lg max-h-[90dvh] rounded-2xl bg-[#181B22] border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-2.5 border-b border-white/10 bg-[#14171D] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-semibold uppercase tracking-wider text-amber-300 shrink-0">
              Iklan
            </span>
            <span className="text-xs font-medium text-slate-300 truncate">
              WMODELER Sponsored Content
            </span>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Tutup Iklan"
            className="min-w-[40px] min-h-[40px] rounded-lg bg-[#232732] hover:bg-[#2C3140] text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ad Content Frame */}
        <div className="relative flex-1 min-h-[200px] sm:min-h-[300px] bg-[#121418] overflow-hidden">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center space-y-2 pointer-events-none">
              <p className="text-xs font-medium text-slate-300">Memuat konten sponsor...</p>
              <p className="text-[11px] text-slate-500 break-all max-w-xs">{STARTUP_AD_URL}</p>
            </div>
          )}
          <iframe
            src={STARTUP_AD_URL}
            title="Iklan Sponsor WMODELER"
            onLoad={() => setIframeLoaded(true)}
            className="relative z-10 w-full h-full min-h-[200px] sm:min-h-[300px] border-0 bg-transparent"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-white/10 bg-[#14171D] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <a
            href={STARTUP_AD_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 flex-1 sm:flex-initial whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            Buka Iklan
          </a>
          <button
            onClick={onDismiss}
            className="min-h-[44px] px-4 rounded-xl bg-[#232732] hover:bg-[#2C3140] text-xs font-semibold text-slate-100 flex items-center justify-center flex-1 sm:flex-initial whitespace-nowrap"
          >
            Tutup &amp; Masuk ke WMODELER
          </button>
        </div>
      </div>
    </div>
  );
};
