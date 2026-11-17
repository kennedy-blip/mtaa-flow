import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Wallet,
  BookOpenCheck,
  Sparkles,
  Lock,
  Plus,
  Receipt,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Banknote,
  Smartphone,
  Trash2,
  Search,
  MinusCircle,
  X,
} from 'lucide-react';
import {
  recordShopExpense,
  voidTransactionAsOwner,
  type CashFlowTransaction,
  type CustomerAccount,
  type InventoryItem,
  type UserRole,
  type AppTab,
} from '../db/db';
import { formatCurrency, formatRelativeOrShortTime, isPastDue } from '../utils/format';
import { SPRING_PHYSICS } from '../utils/motion';

interface CashFlowDashboardProps {
  transactions: CashFlowTransaction[];
  customers: CustomerAccount[];
  inventory: InventoryItem[];
  role: UserRole;
  currency: string;
  mpesaTill: string;
  onOpenQuickSale: (mode: 'Cash' | 'M-Pesa' | 'Credit') => void;
  onNavigateTab: (tab: AppTab) => void;
}

type PeriodFilter = 'today' | '7d' | '30d' | 'all';
type TxFilter = 'all' | 'pos_sale' | 'credit_sale' | 'debt_repayment' | 'expense';

export const CashFlowDashboard: React.FC<CashFlowDashboardProps> = ({
  transactions,
  customers,
  inventory,
  role,
  currency,
  mpesaTill,
  onOpenQuickSale,
  onNavigateTab,
}) => {
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [txSearch, setTxSearch] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<number | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<number | null>(null);

  // Expense modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<'Cash' | 'M-Pesa'>('Cash');

  const periodTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return transactions.filter((tx) => {
      if (period === 'all') return true;
      const ts = new Date(tx.createdAt).getTime();
      if (Number.isNaN(ts)) return false;

      if (period === 'today') {
        return ts >= startOfToday;
      }
      if (period === '7d') {
        return ts >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
      }
      if (period === '30d') {
        return ts >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [transactions, period]);

  const metrics = useMemo(() => {
    let posSalesTotal = 0;
    let creditSalesIssued = 0;
    let repaymentsCollected = 0;
    let cashInDrawer = 0;
    let mpesaInTill = 0;
    let expensesTotal = 0;
    let grossSaleProfit = 0;
    let salesCount = 0;

    for (const tx of periodTransactions) {
      if (tx.kind === 'pos_sale') {
        posSalesTotal += tx.totalAmount;
        grossSaleProfit += tx.netProfit;
        salesCount += 1;
        if (tx.paymentMethod === 'Cash') cashInDrawer += tx.totalAmount;
        if (tx.paymentMethod === 'M-Pesa') mpesaInTill += tx.totalAmount;
      } else if (tx.kind === 'credit_sale') {
        creditSalesIssued += tx.totalAmount;
        grossSaleProfit += tx.netProfit;
        salesCount += 1;
      } else if (tx.kind === 'debt_repayment') {
        repaymentsCollected += tx.totalAmount;
        if (tx.paymentMethod === 'Cash') cashInDrawer += tx.totalAmount;
        if (tx.paymentMethod === 'M-Pesa') mpesaInTill += tx.totalAmount;
      } else if (tx.kind === 'expense') {
        expensesTotal += tx.totalAmount;
        if (tx.paymentMethod === 'Cash') cashInDrawer -= tx.totalAmount;
        if (tx.paymentMethod === 'M-Pesa') mpesaInTill -= tx.totalAmount;
      }
    }

    const totalDailySales = posSalesTotal + creditSalesIssued;
    const cashCollected = posSalesTotal + repaymentsCollected;
    const netEstimatedProfit = grossSaleProfit - expensesTotal;
    const marginPercent =
      totalDailySales > 0 ? Math.round((netEstimatedProfit / totalDailySales) * 1000) / 10 : 0;

    const totalOutstandingCredit = customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
    const activeDebtorsCount = customers.filter((c) => c.balance > 0).length;
    const overdueCount = customers.filter((c) => isPastDue(c.dueDate, c.balance)).length;

    return {
      totalDailySales,
      posSalesTotal,
      creditSalesIssued,
      repaymentsCollected,
      cashCollected,
      cashInDrawer,
      mpesaInTill,
      expensesTotal,
      grossSaleProfit,
      netEstimatedProfit,
      marginPercent,
      salesCount,
      totalOutstandingCredit,
      activeDebtorsCount,
      overdueCount,
    };
  }, [periodTransactions, customers]);

  const lowStockItems = useMemo(
    () => inventory.filter((item) => item.stock <= item.minStock).sort((a, b) => a.stock - b.stock),
    [inventory]
  );

  // Category revenue breakdown for period
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    const invLookup = new Map<number, string>();
    for (const i of inventory) {
      if (i.id) invLookup.set(i.id, i.category);
    }

    for (const tx of periodTransactions) {
      if (tx.kind !== 'pos_sale' && tx.kind !== 'credit_sale') continue;
      for (const line of tx.items) {
        const cat = (line.inventoryId && invLookup.get(line.inventoryId)) || 'General Goods';
        map.set(cat, (map.get(cat) || 0) + line.subtotal);
      }
    }

    const entries = Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const maxAmount = entries[0]?.amount || 1;
    return entries.map((e) => ({
      ...e,
      pct: Math.max(8, Math.round((e.amount / maxAmount) * 100)),
    }));
  }, [periodTransactions, inventory]);

  const filteredActivity = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return [...periodTransactions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((tx) => {
        const matchesKind = txFilter === 'all' || tx.kind === txFilter;
        if (!matchesKind) return false;
        if (!q) return true;
        const inItems = tx.items.some((i) => i.name.toLowerCase().includes(q));
        return (
          tx.receiptNo.toLowerCase().includes(q) ||
          (tx.customerName && tx.customerName.toLowerCase().includes(q)) ||
          (tx.mpesaRef && tx.mpesaRef.toLowerCase().includes(q)) ||
          (tx.note && tx.note.toLowerCase().includes(q)) ||
          inItems
        );
      });
  }, [periodTransactions, txFilter, txSearch]);

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expenseAmount);
    if (!expenseDesc.trim() || !Number.isFinite(amt) || amt <= 0) return;
    await recordShopExpense({
      description: expenseDesc,
      amount: amt,
      paymentMethod: expenseMethod,
      recordedBy: role,
    });
    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseModalOpen(false);
  };

  const handleVoidTx = async (txId: number) => {
    if (role !== 'owner') return;
    await voidTransactionAsOwner(txId);
    setConfirmVoidId(null);
    setExpandedTxId(null);
  };

  const periodLabel =
    period === 'today'
      ? 'Today'
      : period === '7d'
      ? 'Last 7 Days'
      : period === '30d'
      ? 'Last 30 Days'
      : 'All Time';

  return (
    <div className="space-y-5">
      {/* Top Action & Period Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Daily Cash &amp; Profit Recon
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Live cashbook, M-Pesa Till #{mpesaTill}, credit receivables &amp; margin telemetry
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Switcher */}
          <div className="inline-flex p-1 rounded-xl mtaa-glass backdrop-blur-xl">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((p) => {
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className="relative px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    color: active ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="reconPeriodPill"
                      transition={SPRING_PHYSICS}
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                  )}
                  <span className="relative z-10">{p.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setExpenseModalOpen(true)}
            className="mtaa-btn-secondary text-xs py-2 px-3"
          >
            <MinusCircle className="w-3.5 h-3.5" />
            <span>Expense</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuickSale('Credit')}
            className="mtaa-btn-secondary text-xs py-2 px-3"
          >
            <BookOpenCheck className="w-3.5 h-3.5" />
            <span>+ Log Deni</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuickSale('Cash')}
            className="mtaa-btn-primary text-xs py-2 px-3.5"
          >
            <Plus className="w-4 h-4" />
            <span>Record Sale</span>
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Glass Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Total Daily Sales */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_PHYSICS}
          className="p-4 sm:p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Total Sales ({periodLabel})
            </span>
            <div className="w-9 h-9 rounded-xl mtaa-badge-accent flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div
            className="mt-3 text-2xl sm:text-3xl font-extrabold tabular-nums tabular-ledger"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatCurrency(metrics.totalDailySales, currency)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>{metrics.salesCount} receipts</span>
            <span className="tabular-nums">
              Credit: <strong>{formatCurrency(metrics.creditSalesIssued, currency)}</strong>
            </span>
          </div>
        </motion.div>

        {/* 2. Cash Collected */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_PHYSICS, delay: 0.04 }}
          className="p-4 sm:p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Cash &amp; M-Pesa Collected
            </span>
            <div className="w-9 h-9 rounded-xl mtaa-badge-info flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div
            className="mt-3 text-2xl sm:text-3xl font-extrabold tabular-nums tabular-ledger"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatCurrency(metrics.cashCollected, currency)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            <span>Drawer: {formatCurrency(metrics.cashInDrawer, currency)}</span>
            <span>Till: {formatCurrency(metrics.mpesaInTill, currency)}</span>
          </div>
        </motion.div>

        {/* 3. Outstanding Credit */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_PHYSICS, delay: 0.08 }}
          className="p-4 sm:p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Outstanding Credit (Deni)
            </span>
            <div className="w-9 h-9 rounded-xl mtaa-badge-warn flex items-center justify-center">
              <BookOpenCheck className="w-4 h-4" />
            </div>
          </div>
          <div
            className="mt-3 text-2xl sm:text-3xl font-extrabold tabular-nums tabular-ledger"
            style={{ color: 'var(--warn-text)' }}
          >
            {formatCurrency(metrics.totalOutstandingCredit, currency)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>
              {metrics.activeDebtorsCount} owing
              {metrics.overdueCount > 0 ? ` • ${metrics.overdueCount} overdue` : ''}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('ledger')}
              className="inline-flex items-center gap-0.5 font-semibold hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              Ledger <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>

        {/* 4. Net Estimated Profit (Role-gated!) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_PHYSICS, delay: 0.12 }}
          className="p-4 sm:p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Net Estimated Profit
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                role === 'owner' ? 'mtaa-badge-profit' : 'mtaa-surface-subtle'
              }`}
            >
              {role === 'owner' ? <Sparkles className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
          </div>

          {role === 'owner' ? (
            <>
              <div
                className="mt-3 text-2xl sm:text-3xl font-extrabold tabular-nums tabular-ledger"
                style={{ color: 'var(--profit-text)' }}
              >
                {formatCurrency(metrics.netEstimatedProfit, currency)}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="px-2 py-0.5 rounded-full mtaa-badge-profit font-semibold tabular-nums">
                  {metrics.marginPercent}% Net Margin
                </span>
                <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Exp: {formatCurrency(metrics.expensesTotal, currency)}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-3">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mtaa-surface-subtle text-xs font-bold"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Lock className="w-3.5 h-3.5" />
                Owner Privilege Required
              </div>
              <p className="text-[11px] mt-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                Attendant mode hides wholesale cost basis &amp; net profit margins.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Low Stock Urgent Alert Strip */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_PHYSICS}
          className="p-3.5 sm:p-4 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl mtaa-badge-warn flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Smart Stock Alert: {lowStockItems.length} item{lowStockItems.length === 1 ? '' : 's'} running low
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {lowStockItems.slice(0, 4).map((item) => (
                  <span
                    key={item.id}
                    className={`text-[11px] px-2 py-0.5 rounded-md font-semibold tabular-nums ${
                      item.stock <= 0 ? 'mtaa-badge-danger' : 'mtaa-badge-warn'
                    }`}
                  >
                    {item.name}: {item.stock} {item.unit}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="mtaa-btn-secondary text-xs shrink-0 self-start sm:self-center"
          >
            Restock Shelf <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

      {/* Middle Analytics Row: Cash Recon Breakdown + Top Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Cashflow Channels Breakdown */}
        <div className="lg:col-span-7 p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Cash Drawer &amp; Till Reconciliation ({periodLabel})
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Verify physical notes in drawer + M-Pesa Till messages against digital log
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Banknote className="w-3.5 h-3.5" /> Cash Drawer
              </div>
              <div
                className="text-base font-bold mt-1 tabular-nums tabular-ledger"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatCurrency(metrics.cashInDrawer, currency)}
              </div>
            </div>

            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Smartphone className="w-3.5 h-3.5" /> M-Pesa Till
              </div>
              <div
                className="text-base font-bold mt-1 tabular-nums tabular-ledger"
                style={{ color: 'var(--info-text)' }}
              >
                {formatCurrency(metrics.mpesaInTill, currency)}
              </div>
            </div>

            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Deni Repayments In
              </div>
              <div
                className="text-base font-bold mt-1 tabular-nums tabular-ledger"
                style={{ color: 'var(--profit-text)' }}
              >
                +{formatCurrency(metrics.repaymentsCollected, currency)}
              </div>
            </div>

            <div className="p-3 rounded-xl mtaa-surface-subtle">
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                New Deni Issued
              </div>
              <div
                className="text-base font-bold mt-1 tabular-nums tabular-ledger"
                style={{ color: 'var(--warn-text)' }}
              >
                {formatCurrency(metrics.creditSalesIssued, currency)}
              </div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <span>Cash Collection Rate vs Credit Issued</span>
              <span className="font-bold tabular-nums">
                {metrics.totalDailySales > 0
                  ? `${Math.min(
                      100,
                      Math.round((metrics.posSalesTotal / metrics.totalDailySales) * 100)
                    )}% Paid Upfront`
                  : '100% Upfront'}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden mtaa-surface-subtle flex">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width:
                    metrics.totalDailySales > 0
                      ? `${(metrics.posSalesTotal / metrics.totalDailySales) * 100}%`
                      : '100%',
                }}
                transition={SPRING_PHYSICS}
                style={{ backgroundColor: 'var(--accent-primary)' }}
                className="h-full"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width:
                    metrics.totalDailySales > 0
                      ? `${(metrics.creditSalesIssued / metrics.totalDailySales) * 100}%`
                      : '0%',
                }}
                transition={SPRING_PHYSICS}
                style={{ backgroundColor: 'var(--warn-text)' }}
                className="h-full opacity-80"
              />
            </div>
          </div>
        </div>

        {/* Category Sales Mix */}
        <div className="lg:col-span-5 p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Top Moving Categories ({periodLabel})
            </h2>
            <p className="text-xs mb-3.5" style={{ color: 'var(--text-muted)' }}>
              Sales velocity across shop departments
            </p>

            {categoryBreakdown.length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No sales logged for this period yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {categoryBreakdown.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.category}
                      </span>
                      <span
                        className="font-bold tabular-nums tabular-ledger"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatCurrency(item.amount, currency)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full mtaa-surface-subtle overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.pct}%` }}
                        transition={SPRING_PHYSICS}
                        className="h-full rounded-full"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Itemized Ledger & Receipt Stream */}
      <div className="p-4 sm:p-5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Receipt className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              Itemized Cashflow &amp; Receipt Log ({filteredActivity.length})
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tap any entry to inspect itemized basket, payment reference, or void mistake
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search receipt, M-Pesa, item..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="mtaa-input pl-8 py-1.5 text-xs sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'pos_sale', label: 'POS Sales' },
                  { id: 'credit_sale', label: 'Deni Issued' },
                  { id: 'debt_repayment', label: 'Repayments' },
                  { id: 'expense', label: 'Expenses' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTxFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    txFilter === f.id ? 'mtaa-badge-accent' : 'mtaa-surface-subtle'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredActivity.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            No matching transactions in this filter window.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActivity.map((tx) => {
              const isExpanded = expandedTxId === tx.id;
              const badgeClass =
                tx.kind === 'pos_sale'
                  ? 'mtaa-badge-profit'
                  : tx.kind === 'credit_sale'
                  ? 'mtaa-badge-warn'
                  : tx.kind === 'debt_repayment'
                  ? 'mtaa-badge-info'
                  : 'mtaa-badge-danger';

              const kindLabel =
                tx.kind === 'pos_sale'
                  ? `${tx.paymentMethod} Sale`
                  : tx.kind === 'credit_sale'
                  ? 'Deni Credit'
                  : tx.kind === 'debt_repayment'
                  ? `${tx.paymentMethod} Repayment`
                  : 'Shop Expense';

              return (
                <div key={tx.id} className="rounded-2xl mtaa-surface-subtle overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedTxId(isExpanded ? null : tx.id ?? null)}
                    className="w-full p-3.5 text-left flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${badgeClass}`}
                      >
                        {kindLabel}
                      </span>
                      <div className="min-w-0">
                        <div
                          className="text-xs sm:text-sm font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {tx.customerName
                            ? `${tx.customerName} • ${tx.receiptNo}`
                            : tx.kind === 'expense'
                            ? `${tx.note || 'Stall Expense'} • ${tx.receiptNo}`
                            : `Receipt ${tx.receiptNo}${
                                tx.items.length > 0 ? ` (${tx.items[0].name}${tx.items.length > 1 ? ` +${tx.items.length - 1}` : ''})` : ''
                              }`}
                        </div>
                        <div
                          className="text-[11px] flex flex-wrap items-center gap-2 mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>{formatRelativeOrShortTime(tx.createdAt)}</span>
                          {tx.mpesaRef && (
                            <span className="font-mono px-1.5 py-0.2 rounded mtaa-surface-subtle">
                              Ref: {tx.mpesaRef}
                            </span>
                          )}
                          <span className="capitalize">By {tx.recordedBy}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className="text-sm font-extrabold tabular-nums tabular-ledger"
                          style={{
                            color:
                              tx.kind === 'expense'
                                ? 'var(--danger-text)'
                                : tx.kind === 'credit_sale'
                                ? 'var(--warn-text)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {tx.kind === 'expense' ? '-' : ''}
                          {formatCurrency(tx.totalAmount, currency)}
                        </div>
                        {role === 'owner' &&
                          (tx.kind === 'pos_sale' || tx.kind === 'credit_sale') && (
                            <div
                              className="text-[11px] font-semibold tabular-nums"
                              style={{ color: 'var(--profit-text)' }}
                            >
                              +{formatCurrency(tx.netProfit, currency)} profit
                            </div>
                          )}
                      </div>
                      <motion.span
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={SPRING_PHYSICS}
                      >
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      </motion.span>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING_PHYSICS}
                        className="overflow-hidden"
                      >
                        <div
                          className="px-4 pb-4 pt-2 border-t space-y-2.5"
                          style={{ borderColor: 'var(--border-glass)' }}
                        >
                          {tx.items.length > 0 ? (
                            <div className="space-y-1.5">
                              <div
                                className="text-[11px] font-bold uppercase tracking-wider"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Itemized Line Breakdown
                              </div>
                              {tx.items.map((line, i) => (
                                <div
                                  key={`${line.name}-${i}`}
                                  className="flex items-center justify-between text-xs py-1 border-b last:border-b-0"
                                  style={{ borderColor: 'var(--border-glass)' }}
                                >
                                  <span style={{ color: 'var(--text-primary)' }}>
                                    {line.quantity} × {line.name}{' '}
                                    <span style={{ color: 'var(--text-muted)' }}>
                                      (@ {formatCurrency(line.unitPrice, currency)})
                                    </span>
                                  </span>
                                  <span className="font-semibold tabular-nums">
                                    {formatCurrency(line.subtotal, currency)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {tx.note || 'Direct cashbook entry'}
                            </p>
                          )}

                          {tx.note && tx.items.length > 0 && (
                            <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                              Note: {tx.note}
                            </div>
                          )}

                          {role === 'owner' && tx.id && (
                            <div className="flex items-center justify-end gap-2 pt-1">
                              {confirmVoidId === tx.id ? (
                                <>
                                  <span className="text-xs" style={{ color: 'var(--danger-text)' }}>
                                    Reverse stock &amp; delete receipt?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmVoidId(null)}
                                    className="mtaa-btn-secondary text-xs py-1 px-2.5"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleVoidTx(tx.id!)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold mtaa-badge-danger"
                                  >
                                    Confirm Void
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidId(tx.id!)}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg mtaa-badge-danger"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Void &amp; Reverse
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log Daily Expense Modal */}
      <AnimatePresence>
        {expenseModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'var(--bg-modal-backdrop)' }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 8 }}
              transition={SPRING_PHYSICS}
              className="w-full max-w-md rounded-2xl p-5 mtaa-glass-elevated backdrop-blur-xl border border-white/20"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                    Log Daily Shop Expense
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Deducts from cash drawer/till &amp; net daily profit
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleLogExpense} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Expense Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Packaging bags, Boda restock transport, KPLC token"
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    className="mtaa-input text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">Amount ({currency})</label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 150"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="mtaa-input text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Paid From</label>
                    <select
                      value={expenseMethod}
                      onChange={(e) => setExpenseMethod(e.target.value as 'Cash' | 'M-Pesa')}
                      className="mtaa-input text-xs"
                    >
                      <option value="Cash">Cash Drawer</option>
                      <option value="M-Pesa">M-Pesa Till</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setExpenseModalOpen(false)}
                    className="mtaa-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="mtaa-btn-primary text-xs">
                    Save Expense
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
