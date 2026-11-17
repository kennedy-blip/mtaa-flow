import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  Download,
  ShieldCheck,
  WifiOff,
  X,
  CheckCircle2,
  Cpu,
  Layers,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { SPRING_PHYSICS } from '../utils/motion';
import { AnimatedCheckmark } from './AnimatedCheckmark';

export const APK_BINARY_URL = '/apk/mtaaflow-v1.2.0-universal.apk';
export const APK_FILENAME = 'MtaaFlow-v1.2.0-Android.apk';
export const APK_PACKAGE_ID = 'ke.co.mtaaflow.ledger';
export const APK_VERSION = 'v1.2.0 (Capacitor 6 • Build 12)';
export const APK_BUILD_TAG = 'debug-universal';

interface DownloadAPKModalProps {
  isOpen: boolean;
  onClose: () => void;
  apkPreviewFrame: boolean;
  onToggleApkPreviewFrame: (enabled: boolean) => void;
  canInstallPwa: boolean;
  onTriggerPwaInstall: () => void;
}

export const DownloadAPKModal: React.FC<DownloadAPKModalProps> = ({
  isOpen,
  onClose,
  apkPreviewFrame,
  onToggleApkPreviewFrame,
  canInstallPwa,
  onTriggerPwaInstall,
}) => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [packageMeta, setPackageMeta] = useState<{
    state: 'loading' | 'ready' | 'error';
    sha256?: string;
    sizeMb?: string;
  }>({ state: 'loading' });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function inspectPackage() {
      setPackageMeta({ state: 'loading' });
      try {
        const response = await fetch(APK_BINARY_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('missing');
        const buffer = await response.arrayBuffer();

        const sizeMb = `${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB`;
        if (!crypto?.subtle) {
          if (!cancelled) setPackageMeta({ state: 'ready', sizeMb });
          return;
        }

        const digest = await crypto.subtle.digest('SHA-256', buffer);
        const hex = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');

        if (!cancelled) setPackageMeta({ state: 'ready', sha256: hex, sizeMb });
      } catch {
        if (!cancelled) setPackageMeta({ state: 'error' });
      }
    }

    inspectPackage();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleCopySha = async () => {
    if (!packageMeta.sha256) return;
    try {
      await navigator.clipboard.writeText(packageMeta.sha256);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: 'var(--bg-modal-backdrop)' }}
        >
          <motion.div
            initial={{ y: 36, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.95, opacity: 0 }}
            transition={SPRING_PHYSICS}
            className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 mtaa-glass-elevated backdrop-blur-xl border border-white/20 max-h-[92vh] overflow-y-auto space-y-5"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl mtaa-badge-accent flex items-center justify-center shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      MtaaFlow Android APK Center
                    </h2>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-profit">
                      v1.2.0 Ready
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Capacitor Native Android Package • 100% Offline IndexedDB Ledger
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl mtaa-surface-subtle"
                aria-label="Close APK modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {downloadStarted && (
              <div className="p-3 rounded-2xl mtaa-surface-subtle">
                <AnimatedCheckmark
                  size={54}
                  label="APK Package Download Initiated"
                  sublabel={`Open ${APK_FILENAME} on your Android phone to install MtaaFlow offline.`}
                />
              </div>
            )}

            {/* Package Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl mtaa-surface-subtle">
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <Cpu className="w-3.5 h-3.5" /> Runtime Bridge
                </div>
                <div className="text-xs font-bold mt-1">@capacitor/android 6.2</div>
              </div>

              <div className="p-3 rounded-xl mtaa-surface-subtle">
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <WifiOff className="w-3.5 h-3.5" /> Offline Engine
                </div>
                <div className="text-xs font-bold mt-1">Dexie IndexedDB + SW</div>
              </div>

              <div className="p-3 rounded-xl mtaa-surface-subtle col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <ShieldCheck className="w-3.5 h-3.5" /> Target OS
                </div>
                <div className="text-xs font-bold mt-1">
                  Android 8.0+{packageMeta.sizeMb ? ` • ${packageMeta.sizeMb}` : ''}
                </div>
              </div>
            </div>

            {/* Package Identifier & SHA-256 */}
            <div className="p-3.5 rounded-2xl mtaa-surface-subtle space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Application ID:</span>
                <code className="font-mono font-semibold">{APK_PACKAGE_ID}</code>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--text-muted)' }}>SHA-256 Digest:</span>
                {packageMeta.state === 'loading' && (
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    verifying binary…
                  </span>
                )}
                {packageMeta.state === 'error' && (
                  <span className="font-mono text-[11px]" style={{ color: 'var(--warn-text)' }}>
                    binary not deployed on this host
                  </span>
                )}
                {packageMeta.state === 'ready' && packageMeta.sha256 && (
                  <button
                    type="button"
                    onClick={handleCopySha}
                    className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md mtaa-surface-subtle"
                    title={packageMeta.sha256}
                  >
                    <span>{packageMeta.sha256.slice(0, 24)}…</span>
                    {copiedHash ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
                {packageMeta.state === 'ready' && !packageMeta.sha256 && (
                  <span className="font-mono text-[11px]">digest unavailable</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Build Channel:</span>
                <code className="font-mono font-semibold">{APK_BUILD_TAG}</code>
              </div>
            </div>

            {/* Primary Download & PWA Actions */}
            <div className="space-y-2.5">
              <a
                href={APK_BINARY_URL}
                download={APK_FILENAME}
                onClick={() => setDownloadStarted(true)}
                className="w-full mtaa-btn-primary py-3.5 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Android APK ({APK_VERSION})</span>
              </a>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onToggleApkPreviewFrame(!apkPreviewFrame);
                    onClose();
                  }}
                  className="mtaa-btn-secondary text-xs py-2.5"
                >
                  <Layers className="w-4 h-4" />
                  <span>
                    {apkPreviewFrame ? 'Exit APK Mobile Frame' : 'Preview Native APK UI Frame'}
                  </span>
                </button>

                {canInstallPwa ? (
                  <button
                    type="button"
                    onClick={onTriggerPwaInstall}
                    className="mtaa-btn-secondary text-xs py-2.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Install Instant Offline Web App</span>
                  </button>
                ) : (
                  <div
                    className="px-3 py-2 rounded-xl mtaa-surface-subtle text-[11px] flex items-center justify-center gap-1.5 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--profit-text)' }} />
                    <span>Offline PWA Cache Active</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sideload Instructions */}
            <div className="p-3.5 rounded-2xl mtaa-surface-subtle space-y-1.5">
              <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                Quick Android Installation Guide:
              </div>
              <ol
                className="text-xs space-y-1 list-decimal list-inside"
                style={{ color: 'var(--text-secondary)' }}
              >
                <li>Tap <strong>Download Android APK</strong> above on your Android phone.</li>
                <li>Open the downloaded <code>{APK_FILENAME}</code> notification.</li>
                <li>Allow <em>Install from this browser</em> if prompted, then tap <strong>Install</strong>.</li>
                <li>Launch <strong>MtaaFlow</strong> — works 100% offline with native bottom navigation!</li>
              </ol>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
