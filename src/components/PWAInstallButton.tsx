import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  // Show compact button when natively installable, or on mobile browsers (Android / iOS),
  // and always show full button inside Settings / Dashboard install sections.
  if (variant === 'compact' && !isInstallable && !isIOS && !isAndroid) {
    return null;
  }

  return (
    <>
      {variant === 'compact' ? (
        <button
          onClick={handleClick}
          className="min-h-[40px] px-3 rounded-lg bg-[#232732] hover:bg-[#2C3140] border border-blue-500/40 text-xs font-semibold text-blue-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
        >
          <Download className="w-3.5 h-3.5" />
          Install App
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.98] transition-transform"
        >
          <Smartphone className="w-4 h-4" />
          {isInstallable ? 'Install WMODELER to Android' : 'Install WMODELER App'}
        </button>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1A1D24] border border-white/15 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Install WMODELER on Phone</h3>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-w-[40px] min-h-[40px] rounded-lg bg-[#232732] hover:bg-[#2C3140] text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>To install WMODELER on iPhone or iPad:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-200">
                  <li>
                    Open the published link in <strong>Safari</strong>.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button in the browser toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>
                  After publishing WMODELER, open the shared app URL in <strong>Google Chrome</strong>{' '}
                  on your Android phone (outside preview iframes):
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-200">
                  <li>
                    Tap <strong>Install WMODELER</strong> when the prompt appears, or tap the{' '}
                    <strong>⋮ Menu</strong> in Chrome.
                  </li>
                  <li>
                    Select <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                  </li>
                  <li>
                    Confirm <strong>Install</strong> — WMODELER will appear in your Android App Drawer
                    with its icon and run fullscreen offline.
                  </li>
                </ol>
              </div>
            )}

            <button
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-3 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Projects saved locally</span>
    </div>
  );
};
