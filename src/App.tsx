import React, { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpenCheck,
  Package,
  Settings,
  Plus,
  Smartphone,
  Wifi,
  WifiOff,
  Download,
  BatteryCharging,
  Layers,
} from 'lucide-react';
import {
  db,
  DEFAULT_SHOP_SETTINGS,
  type AppTab,
  type ShopSettings,
  type InventoryItem,
} from './db/db';
import { ensureDatabaseSeeded } from './db/seed';
import { SPRING_PHYSICS } from './utils/motion';
import { CashFlowDashboard } from './components/CashFlowDashboard';
import { CreditLedger } from './components/CreditLedger';
import { InventoryManager } from './components/InventoryManager';
import { SettingsCenter } from './components/SettingsCenter';
import { ThemeToggle } from './components/ThemeToggle';
import { RoleSwitcher } from './components/RoleSwitcher';
import { QuickSaleModal } from './components/QuickSaleModal';
import { DownloadAPKModal } from './components/DownloadAPKModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const NAV_ITEMS: {
  id: AppTab;
  label: string;
  mobileLabel: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Daily Recon', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'ledger', label: 'Credit Ledger', mobileLabel: 'Credit Ledger', icon: BookOpenCheck },
  { id: 'inventory', label: 'Inventory', mobileLabel: 'Inventory', icon: Package },
  { id: 'settings', label: 'Settings & APK', mobileLabel: 'Settings', icon: Settings },
];

export const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Modals state
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalMode, setSaleModalMode] = useState<'Cash' | 'M-Pesa' | 'Credit'>('Cash');
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<number | undefined>(
    undefined
  );
  const [preselectedItem, setPreselectedItem] = useState<InventoryItem | null>(null);
  const [apkModalOpen, setApkModalOpen] = useState(false);

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const isNativeCapacitor = useMemo(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    ensureDatabaseSeeded()
      .catch(() => {
        // IndexedDB initialized
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  // Reactive IndexedDB Queries
  const storedSettings = useLiveQuery(() => db.settings.get('app_config'), []);
  const inventory = useLiveQuery(() => db.inventory.toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const creditEntries = useLiveQuery(() => db.creditEntries.toArray(), []) ?? [];
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? [];
  const stockLogs = useLiveQuery(() => db.stockLogs.toArray(), []) ?? [];

  const settings: ShopSettings = storedSettings ?? DEFAULT_SHOP_SETTINGS;

  // Sync theme attribute to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute(
        'content',
        settings.theme === 'savannah'
          ? '#eef4f1'
          : settings.theme === 'amber'
          ? '#070500'
          : '#0d0d12'
      );
    }
  }, [settings.theme]);

  const updateSettings = async (partial: Partial<ShopSettings>) => {
    const current = (await db.settings.get('app_config')) ?? DEFAULT_SHOP_SETTINGS;
    await db.settings.put({
      ...current,
      ...partial,
      id: 'app_config',
    });
  };

  const lowStockBadgeCount = useMemo(
    () => inventory.filter((i) => i.stock <= i.minStock).length,
    [inventory]
  );

  const activeDebtorsBadgeCount = useMemo(
    () => customers.filter((c) => c.balance > 0).length,
    [customers]
  );

  const handleOpenQuickSale = (
    mode: 'Cash' | 'M-Pesa' | 'Credit',
    customerId?: number,
    item?: InventoryItem | null
  ) => {
    setSaleModalMode(mode);
    setPreselectedCustomerId(customerId);
    setPreselectedItem(item ?? null);
    setSaleModalOpen(true);
  };

  const handleTriggerPwaInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="mtaa-mesh-canvas">
          <div className="mtaa-mesh-orb-1" />
          <div className="mtaa-mesh-orb-2" />
        </div>
        <div className="relative z-10 p-6 rounded-2xl mtaa-glass backdrop-blur-xl text-center space-y-2">
          <div className="text-lg font-extrabold">MtaaFlow OS</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Mounting Offline IndexedDB Ledger…
          </div>
        </div>
      </div>
    );
  }

  const renderActiveScreen = () => (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={SPRING_PHYSICS}
      >
        {activeTab === 'dashboard' && (
          <CashFlowDashboard
            transactions={transactions}
            customers={customers}
            inventory={inventory}
            role={settings.role}
            currency={settings.currency}
            mpesaTill={settings.mpesaTill}
            onOpenQuickSale={(mode) => handleOpenQuickSale(mode)}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'ledger' && (
          <CreditLedger
            customers={customers}
            creditEntries={creditEntries}
            role={settings.role}
            currency={settings.currency}
            shopName={settings.shopName}
            mpesaTill={settings.mpesaTill}
            onLogDebtForCustomer={(customerId) =>
              handleOpenQuickSale('Credit', customerId, null)
            }
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryManager
            inventory={inventory}
            stockLogs={stockLogs}
            role={settings.role}
            currency={settings.currency}
            onSellItem={(item) => handleOpenQuickSale('Cash', undefined, item)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsCenter
            settings={settings}
            onUpdateSettings={updateSettings}
            inventory={inventory}
            customers={customers}
            creditEntries={creditEntries}
            transactions={transactions}
            stockLogs={stockLogs}
            onOpenApkModal={() => setApkModalOpen(true)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );

  const renderBottomNavBar = (layoutNamespace: string) => (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="mtaa-glass-elevated backdrop-blur-xl border-t px-2 pt-2 pb-safe"
      style={{ borderColor: 'var(--border-glass)' }}
    >
      <div className="grid grid-cols-4 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const badge =
            item.id === 'inventory'
              ? lowStockBadgeCount
              : item.id === 'ledger'
              ? activeDebtorsBadgeCount
              : 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="relative flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-colors"
              style={{
                color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {active && (
                <motion.span
                  layoutId={`bottomNavActive-${layoutNamespace}`}
                  transition={SPRING_PHYSICS}
                  className="absolute inset-0 rounded-2xl mtaa-surface-subtle"
                  style={{ borderColor: 'var(--accent-border)' }}
                />
              )}
              <div className="relative z-10">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                      item.id === 'inventory' ? 'mtaa-badge-warn' : 'mtaa-badge-accent'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <span className="relative z-10 text-[10px] font-bold mt-1 truncate max-w-full">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  // Native Capacitor APK OR Simulated Android APK Frame Mode
  const useMobileApkFrame = isNativeCapacitor || settings.apkPreviewFrame;

  return (
    <div className="min-h-screen relative">
      {/* Animated Frosted Acrylic Mesh Backdrop */}
      <div className="mtaa-mesh-canvas">
        <div className="mtaa-mesh-orb-1" />
        <div className="mtaa-mesh-orb-2" />
        <div className="mtaa-mesh-orb-3" />
        <div className="mtaa-mesh-grid" />
      </div>

      {useMobileApkFrame ? (
        /* ======================================================================
           NATIVE ANDROID APK LAYOUT (Real Capacitor Native OR Desktop Simulator)
           ====================================================================== */
        <div
          className={`relative z-10 min-h-screen flex flex-col items-center justify-center ${
            isNativeCapacitor ? 'p-0' : 'p-0 sm:p-6'
          }`}
        >
          {!isNativeCapacitor && (
            <div className="hidden sm:flex items-center gap-3 mb-3 px-4 py-2 rounded-full mtaa-glass backdrop-blur-xl border border-white/20 text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                Capacitor Android APK Frame Preview
              </span>
              <ThemeToggle
                theme={settings.theme}
                onChange={(next) => updateSettings({ theme: next })}
              />
              <button
                type="button"
                onClick={() => updateSettings({ apkPreviewFrame: false })}
                className="mtaa-btn-secondary text-xs py-1 px-2.5"
              >
                Fullscreen Web Layout
              </button>
            </div>
          )}

          <div
            className={`w-full flex flex-col overflow-hidden mtaa-glass backdrop-blur-xl ${
              isNativeCapacitor
                ? 'min-h-screen'
                : 'min-h-screen sm:min-h-0 sm:h-[840px] sm:max-h-[88vh] sm:max-w-[430px] sm:rounded-[2.5rem] sm:border-[6px]'
            }`}
            style={{
              borderColor: isNativeCapacitor ? 'transparent' : 'var(--border-strong)',
              backgroundColor: 'var(--bg-canvas)',
            }}
          >
            {/* Simulated Android Status Bar (when in desktop frame preview) */}
            {!isNativeCapacitor && (
              <div
                className="hidden sm:flex items-center justify-between px-6 pt-2.5 pb-1.5 text-[11px] font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                <span className="font-mono">
                  {new Date().toLocaleTimeString('en-KE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </span>
                <div className="w-16 h-3.5 rounded-full bg-black/50 border border-white/10" />
                <div className="flex items-center gap-1.5">
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <BatteryCharging className="w-3.5 h-3.5" />
                </div>
              </div>
            )}

            {/* Mobile App Top Header */}
            <header
              className="px-4 py-3 mtaa-glass backdrop-blur-xl border-b flex items-center justify-between gap-2 shrink-0"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--accent-on-primary)',
                  }}
                >
                  M
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate leading-tight">MtaaFlow</div>
                  <div
                    className="text-[10px] truncate flex items-center gap-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{
                        backgroundColor: isOnline ? 'var(--profit-text)' : 'var(--warn-text)',
                      }}
                    />
                    {isOnline ? 'IndexedDB Synced' : 'Offline Mode Active'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <RoleSwitcher
                  role={settings.role}
                  onChangeRole={(next) => updateSettings({ role: next })}
                  requirePinForOwner={settings.requirePinForOwner}
                  ownerPin={settings.ownerPin}
                  compact
                />
                <button
                  type="button"
                  onClick={() => handleOpenQuickSale('Cash')}
                  className="mtaa-btn-primary p-2 rounded-xl"
                  title="Quick Sale"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Scrollable Native Viewport */}
            <main className="flex-1 overflow-y-auto p-4">{renderActiveScreen()}</main>

            {/* Native Bottom Navigation Bar */}
            {renderBottomNavBar('apk')}
          </div>
        </div>
      ) : (
        /* ======================================================================
           FULLSCREEN RESPONSIVE WEB LAYOUT (Desktop Sidebar + Mobile Bottom Nav)
           ====================================================================== */
        <div className="relative z-10 min-h-screen flex">
          {/* Desktop / Tablet Glass Sidebar */}
          <aside className="hidden lg:flex lg:w-72 xl:w-76 shrink-0 flex-col justify-between p-4 sticky top-0 h-screen">
            <div className="h-full rounded-3xl mtaa-glass backdrop-blur-xl border border-white/20 p-4 flex flex-col justify-between">
              <div className="space-y-5">
                {/* Brand Identity */}
                <div className="flex items-center gap-3 px-2 pt-1">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg shadow-lg shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--accent-on-primary)',
                    }}
                  >
                    M
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-extrabold tracking-tight leading-tight">
                      MtaaFlow OS
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {settings.shopName}
                    </div>
                  </div>
                </div>

                {/* Offline Heartbeat Status Pill */}
                <div className="px-3 py-2 rounded-xl mtaa-surface-subtle flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {isOnline ? (
                      <Wifi className="w-3.5 h-3.5" style={{ color: 'var(--profit-text)' }} />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5" style={{ color: 'var(--warn-text)' }} />
                    )}
                    {isOnline ? 'Offline-Ready Vault' : 'Working Offline'}
                  </span>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded mtaa-badge-profit"
                  >
                    Dexie DB
                  </span>
                </div>

                {/* Quick POS Sale Primary Button */}
                <button
                  type="button"
                  onClick={() => handleOpenQuickSale('Cash')}
                  className="w-full mtaa-btn-primary py-3 text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Sale / Log Deni</span>
                </button>

                {/* Primary Navigation Links */}
                <nav aria-label="Sidebar Navigation" className="space-y-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    const badge =
                      item.id === 'inventory'
                        ? lowStockBadgeCount
                        : item.id === 'ledger'
                        ? activeDebtorsBadgeCount
                        : 0;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className="relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                        style={{
                          color: active ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="desktopSidebarActivePill"
                            transition={SPRING_PHYSICS}
                            className="absolute inset-0 rounded-xl"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </span>

                        {badge > 0 && (
                          <span
                            className={`relative z-10 text-[11px] font-extrabold px-2 py-0.5 rounded-full tabular-nums ${
                              active
                                ? 'bg-black/20 text-current'
                                : item.id === 'inventory'
                                ? 'mtaa-badge-warn'
                                : 'mtaa-badge-accent'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Bottom APK Download Card inside Sidebar */}
              <div className="p-3.5 rounded-2xl mtaa-surface-subtle space-y-2.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-bold">Android APK v1.2.0</span>
                </div>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                  Install the native offline ledger APK directly onto your shop handset.
                </p>
                <button
                  type="button"
                  onClick={() => setApkModalOpen(true)}
                  className="w-full mtaa-btn-secondary text-xs py-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Android APK</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-6">
            {/* Sticky Glass Top Header */}
            <header className="sticky top-0 z-30 px-4 sm:px-6 pt-3 pb-2">
              <div className="px-4 py-2.5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 flex flex-wrap items-center justify-between gap-3">
                {/* Mobile Brand + Shop Location */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--accent-on-primary)',
                    }}
                  >
                    M
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{settings.shopName}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {settings.location} • Till #{settings.mpesaTill}
                    </div>
                  </div>
                </div>

                {/* Global Role Switcher, Theme Engine & APK Frame Controls */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <RoleSwitcher
                    role={settings.role}
                    onChangeRole={(next) => updateSettings({ role: next })}
                    requirePinForOwner={settings.requirePinForOwner}
                    ownerPin={settings.ownerPin}
                    compact
                  />

                  <ThemeToggle
                    theme={settings.theme}
                    onChange={(next) => updateSettings({ theme: next })}
                    variant="compact"
                  />

                  <button
                    type="button"
                    onClick={() => updateSettings({ apkPreviewFrame: true })}
                    className="hidden md:inline-flex mtaa-btn-secondary text-xs py-1.5 px-2.5"
                    title="Preview Native Android APK Mobile Frame & Bottom Navigation"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>APK Frame</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setApkModalOpen(true)}
                    className="hidden sm:inline-flex lg:hidden mtaa-btn-secondary text-xs py-1.5 px-2.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>APK</span>
                  </button>
                </div>
              </div>
            </header>

            {/* Page View Container */}
            <main className="flex-1 px-4 sm:px-6 pt-3 max-w-7xl w-full mx-auto">
              {renderActiveScreen()}
            </main>
          </div>

          {/* Mobile Fixed Bottom Navigation Bar (< lg screens) */}
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-40">
            {renderBottomNavBar('mobileWeb')}
          </div>
        </div>
      )}

      {/* Global Modals */}
      <QuickSaleModal
        isOpen={saleModalOpen}
        onClose={() => setSaleModalOpen(false)}
        inventory={inventory}
        customers={customers}
        role={settings.role}
        currency={settings.currency}
        initialMode={saleModalMode}
        preselectedCustomerId={preselectedCustomerId}
        preselectedItem={preselectedItem}
      />

      <DownloadAPKModal
        isOpen={apkModalOpen}
        onClose={() => setApkModalOpen(false)}
        apkPreviewFrame={settings.apkPreviewFrame}
        onToggleApkPreviewFrame={(enabled) => updateSettings({ apkPreviewFrame: enabled })}
        canInstallPwa={Boolean(deferredPrompt)}
        onTriggerPwaInstall={handleTriggerPwaInstall}
      />
    </div>
  );
};

export default App;
