import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone,
  Download,
  HardDrive,
  ShieldCheck,
  UserCheck,
  Store,
  FileJson,
  Upload,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  Lock,
  Check,
  Layers,
  WifiOff,
  KeyRound,
} from 'lucide-react';
import {
  db,
  exportFullLedgerBackup,
  importFullLedgerBackup,
  type ShopSettings,
  type ThemeMode,
  type UserRole,
  type InventoryItem,
  type CustomerAccount,
  type CreditLedgerEntry,
  type CashFlowTransaction,
  type StockMovementLog,
} from '../db/db';
import { resetWithRealisticDemoData } from '../db/seed';
import { SPRING_PHYSICS } from '../utils/motion';
import { ThemeToggle } from './ThemeToggle';
import { RoleSwitcher } from './RoleSwitcher';
import { APK_BINARY_URL, APK_FILENAME, APK_PACKAGE_ID, APK_VERSION } from './DownloadAPKModal';

interface SettingsCenterProps {
  settings: ShopSettings;
  onUpdateSettings: (partial: Partial<ShopSettings>) => Promise<void>;
  inventory: InventoryItem[];
  customers: CustomerAccount[];
  creditEntries: CreditLedgerEntry[];
  transactions: CashFlowTransaction[];
  stockLogs: StockMovementLog[];
  onOpenApkModal: () => void;
}

export const SettingsCenter: React.FC<SettingsCenterProps> = ({
  settings,
  onUpdateSettings,
  inventory,
  customers,
  creditEntries,
  transactions,
  stockLogs,
  onOpenApkModal,
}) => {
  const [shopName, setShopName] = useState(settings.shopName);
  const [location, setLocation] = useState(settings.location);
  const [merchantPhone, setMerchantPhone] = useState(settings.merchantPhone);
  const [mpesaTill, setMpesaTill] = useState(settings.mpesaTill);
  const [currency, setCurrency] = useState(settings.currency);
  const [ownerPin, setOwnerPin] = useState(settings.ownerPin);
  const [requirePin, setRequirePin] = useState(settings.requirePinForOwner);
  const [savedBanner, setSavedBanner] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Storage estimate state
  const [storageStats, setStorageStats] = useState<{
    usageBytes: number;
    quotaBytes: number;
  }>({ usageBytes: 0, quotaBytes: 0 });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setShopName(settings.shopName);
    setLocation(settings.location);
    setMerchantPhone(settings.merchantPhone);
    setMpesaTill(settings.mpesaTill);
    setCurrency(settings.currency);
    setOwnerPin(settings.ownerPin);
    setRequirePin(settings.requirePinForOwner);
  }, [settings]);

  useEffect(() => {
    let active = true;
    async function estimateStorage() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (active) {
            setStorageStats({
              usageBytes: est.usage || 0,
              quotaBytes: est.quota || 0,
            });
          }
        } catch {
          // Ignore estimate error
        }
      }
    }
    estimateStorage();
    return () => {
      active = false;
    };
  }, [inventory.length, customers.length, transactions.length, creditEntries.length]);

  const totalRecords =
    inventory.length +
    customers.length +
    creditEntries.length +
    transactions.length +
    stockLogs.length;

  const approxPayloadBytes =
    JSON.stringify({ inventory, customers, creditEntries, transactions, stockLogs }).length;

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return `${(approxPayloadBytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const flashNotice = (msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(''), 3200);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.role !== 'owner') return;
    await onUpdateSettings({
      shopName: shopName.trim() || 'MtaaFlow Duka',
      location: location.trim(),
      merchantPhone: merchantPhone.trim(),
      mpesaTill: mpesaTill.trim(),
      currency: currency.trim() || 'KSh',
      ownerPin: ownerPin.trim() || '2580',
      requirePinForOwner: requirePin,
    });
    flashNotice('Shop profile & security settings saved to offline storage.');
  };

  const handleExportJson = async () => {
    if (settings.role !== 'owner') return;
    const backup = await exportFullLedgerBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtaaflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flashNotice('Full JSON ledger backup downloaded.');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || settings.role !== 'owner') return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await importFullLedgerBackup(parsed);
      flashNotice('Ledger backup restored successfully!');
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Invalid backup JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportCsv = () => {
    if (settings.role !== 'owner') return;
    const headers = [
      'ReceiptNo',
      'DateISO',
      'Type',
      'PaymentMethod',
      'Customer',
      'MpesaRef',
      'TotalAmount',
      'TotalCost',
      'NetProfit',
      'RecordedBy',
      'Note',
    ];
    const rows = transactions.map((t) => [
      t.receiptNo,
      t.createdAt,
      t.kind,
      t.paymentMethod,
      `"${(t.customerName || '').replace(/"/g, '""')}"`,
      t.mpesaRef || '',
      t.totalAmount,
      t.totalCost,
      t.netProfit,
      t.recordedBy,
      `"${(t.note || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtaaflow-cashflow-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flashNotice('Transactions CSV report downloaded.');
  };

  return (
    <div className="space-y-6">
      {/* Settings Header with Prominent Role Switcher (as required by Section 4) */}
      <div className="p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Settings, Privileges &amp; APK Center
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Switch active operator role, customize surface themes, manage offline IndexedDB &amp; download Android APK
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Active Role:
          </span>
          <RoleSwitcher
            role={settings.role}
            onChangeRole={(next: UserRole) => onUpdateSettings({ role: next })}
            requirePinForOwner={settings.requirePinForOwner}
            ownerPin={settings.ownerPin}
          />
        </div>
      </div>

      {savedBanner && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_PHYSICS}
          className="p-3.5 rounded-2xl mtaa-badge-profit text-xs font-semibold flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{savedBanner}</span>
        </motion.div>
      )}

      {/* Prominent Android APK Download Hero Section */}
      <div className="p-5 sm:p-6 rounded-3xl mtaa-glow-card backdrop-blur-xl border border-white/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mtaa-badge-accent text-xs font-bold">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Capacitor Native Android Build • {APK_VERSION}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Install MtaaFlow on Your Shop Android Phone
            </h2>
            <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Compiled with <code>@capacitor/android</code> ({APK_PACKAGE_ID}) for full offline
              merchant operation in zero-network areas. Features native bottom navigation bar,
              hardware back-button support, and persistent IndexedDB credit &amp; stock storage.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" /> Zero Data Needed Offline
              </span>
              <span>•</span>
              <span>Android 8.0+ (API 26+)</span>
              <span>•</span>
              <span className="font-mono">{APK_PACKAGE_ID}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
            <a
              href={APK_BINARY_URL}
              download={APK_FILENAME}
              className="mtaa-btn-primary py-3.5 px-6 text-sm font-extrabold shadow-lg"
            >
              <Download className="w-4 h-4" />
              <span>Download Android APK</span>
            </a>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onOpenApkModal}
                className="flex-1 mtaa-btn-secondary text-xs py-2 px-3"
              >
                Build Checksum &amp; Guide
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ apkPreviewFrame: !settings.apkPreviewFrame })
                }
                className="flex-1 mtaa-btn-secondary text-xs py-2 px-3"
                title="Simulate the native Android APK frame & bottom navigation bar on desktop"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{settings.apkPreviewFrame ? 'Web View' : 'APK Frame'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Engine (3 Modes) */}
      <div className="p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Surface &amp; Sunlight Theme Engine (3 Modes)
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Switch instantaneously between frosted milk glass, deep nocturnal obsidian, or high-contrast outdoor stall amber
          </p>
        </div>

        <ThemeToggle
          theme={settings.theme}
          onChange={(next: ThemeMode) => onUpdateSettings({ theme: next })}
          variant="cards"
        />
      </div>

      {/* Role Privilege Matrix Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-2.5 ${
            settings.role === 'owner' ? 'ring-2' : ''
          }`}
          style={{
            boxShadow: settings.role === 'owner' ? '0 0 0 2px var(--accent-primary)' : undefined,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-bold">Merchant Owner (Admin)</h3>
            </div>
            {settings.role === 'owner' && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-accent">
                Current Role
              </span>
            )}
          </div>
          <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
            <li>• View real-time Net Estimated Profit, buying costs &amp; gross margins</li>
            <li>• Override unit prices at checkout &amp; edit catalog pricing</li>
            <li>• Void/reverse mistaken sales &amp; delete customer or SKU records</li>
            <li>• Export/import full JSON ledger backups &amp; CSV reports</li>
          </ul>
        </div>

        <div
          className={`p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-2.5 ${
            settings.role === 'staff' ? 'ring-2' : ''
          }`}
          style={{
            boxShadow: settings.role === 'staff' ? '0 0 0 2px var(--accent-primary)' : undefined,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h3 className="text-sm font-bold">Shop Attendant (Staff)</h3>
            </div>
            {settings.role === 'staff' && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-accent">
                Current Role
              </span>
            )}
          </div>
          <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
            <li>• Log new Cash, M-Pesa &amp; itemized Deni credit sales</li>
            <li>• Check customer credit balances &amp; record debt repayments</li>
            <li>• Add incoming restock quantities to existing inventory</li>
            <li>• Restricted from viewing net profit totals, cost prices, or deleting records</li>
          </ul>
        </div>
      </div>

      {/* Offline Storage Management & Backup Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Storage Telemetry */}
        <div className="lg:col-span-6 p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl mtaa-badge-info flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Offline IndexedDB Storage Stats</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Dexie.js local persistence (`MtaaFlowOfflineLedgerDB`)
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg mtaa-surface-subtle tabular-nums">
              {formatBytes(storageStats.usageBytes)} used
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Inventory SKUs
              </span>
              <span className="text-base font-extrabold tabular-nums">{inventory.length}</span>
            </div>
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Credit Customers
              </span>
              <span className="text-base font-extrabold tabular-nums">{customers.length}</span>
            </div>
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Deni Entries
              </span>
              <span className="text-base font-extrabold tabular-nums">{creditEntries.length}</span>
            </div>
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Cashflow Receipts
              </span>
              <span className="text-base font-extrabold tabular-nums">{transactions.length}</span>
            </div>
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Stock Audit Logs
              </span>
              <span className="text-base font-extrabold tabular-nums">{stockLogs.length}</span>
            </div>
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Total Records
              </span>
              <span className="text-base font-extrabold tabular-nums">{totalRecords}</span>
            </div>
          </div>

          {/* Owner Data Backup & Export Buttons */}
          {settings.role === 'owner' ? (
            <div className="pt-2 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Owner Backup, Export &amp; Ledger Reset
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="mtaa-btn-secondary text-xs py-2 px-3"
                >
                  <FileJson className="w-3.5 h-3.5" /> Export Backup JSON
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mtaa-btn-secondary text-xs py-2 px-3"
                >
                  <Upload className="w-3.5 h-3.5" /> Import JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJson}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="mtaa-btn-secondary text-xs py-2 px-3"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Export Recon CSV
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {confirmReset ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--warn-text)' }}>
                      Restore realistic demo records?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="mtaa-btn-secondary text-xs py-1 px-2.5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await resetWithRealisticDemoData(false);
                        setConfirmReset(false);
                        flashNotice('Demo merchant dataset restored!');
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold mtaa-badge-warn"
                    >
                      Confirm Reset
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="mtaa-btn-secondary text-xs py-1.5 px-3"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Demo Data
                  </button>
                )}

                {confirmWipe ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--danger-text)' }}>
                      Wipe all transactions &amp; SKUs?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmWipe(false)}
                      className="mtaa-btn-secondary text-xs py-1 px-2.5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await Promise.all([
                          db.inventory.clear(),
                          db.customers.clear(),
                          db.creditEntries.clear(),
                          db.transactions.clear(),
                          db.stockLogs.clear(),
                        ]);
                        setConfirmWipe(false);
                        flashNotice('All local ledger tables cleared for fresh shop setup.');
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold mtaa-badge-danger"
                    >
                      Confirm Wipe
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmWipe(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold mtaa-badge-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Start Empty Ledger
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl mtaa-surface-subtle flex items-center gap-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Data export, backup restoration, and ledger resets are restricted to{' '}
                <strong>Merchant Owner (Admin)</strong>.
              </span>
            </div>
          )}
        </div>

        {/* Shop Identity & Owner PIN Form */}
        <div className="lg:col-span-6 p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl mtaa-badge-accent flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Shop Identity &amp; Owner PIN Lock</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Printed on WhatsApp credit statements &amp; receipts
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1">Duka / Business Name</label>
                <input
                  type="text"
                  disabled={settings.role !== 'owner'}
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="mtaa-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Location / Market</label>
                <input
                  type="text"
                  disabled={settings.role !== 'owner'}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mtaa-input text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1">Merchant Phone</label>
                <input
                  type="tel"
                  disabled={settings.role !== 'owner'}
                  value={merchantPhone}
                  onChange={(e) => setMerchantPhone(e.target.value)}
                  className="mtaa-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">M-Pesa Till Number</label>
                <input
                  type="text"
                  disabled={settings.role !== 'owner'}
                  value={mpesaTill}
                  onChange={(e) => setMpesaTill(e.target.value)}
                  className="mtaa-input text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Currency Symbol</label>
                <select
                  disabled={settings.role !== 'owner'}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mtaa-input text-xs"
                >
                  <option value="KSh">KSh (KES)</option>
                  <option value="KES">KES</option>
                  <option value="TSh">TSh (TZS)</option>
                  <option value="USh">USh (UGX)</option>
                  <option value="$">USD ($)</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl mtaa-surface-subtle space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <KeyRound className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Require PIN when switching from Staff to Owner</span>
                </div>
                <input
                  type="checkbox"
                  disabled={settings.role !== 'owner'}
                  checked={requirePin}
                  onChange={(e) => setRequirePin(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </div>

              {requirePin && (
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                    4-Digit Owner PIN
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    disabled={settings.role !== 'owner'}
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    className="mtaa-input text-xs font-mono w-36 tracking-widest"
                  />
                </div>
              )}
            </div>

            {settings.role === 'owner' ? (
              <div className="flex justify-end pt-1">
                <button type="submit" className="mtaa-btn-primary text-xs py-2 px-4">
                  Save Shop Configuration
                </button>
              </div>
            ) : (
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Lock className="w-3.5 h-3.5" /> Switch to Owner role to modify shop profile &amp; PIN.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
