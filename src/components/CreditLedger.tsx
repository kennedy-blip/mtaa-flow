import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Phone,
  MapPin,
  ChevronDown,
  CalendarClock,
  CheckCircle2,
  AlertOctagon,
  HandCoins,
  Copy,
  Check,
  MessageCircle,
  Trash2,
  Edit3,
  X,
  Banknote,
  Smartphone,
  ShoppingBag,
  UserPlus,
} from 'lucide-react';
import {
  db,
  recordCustomerRepayment,
  deleteCustomerAsOwner,
  type CustomerAccount,
  type CreditLedgerEntry,
  type UserRole,
} from '../db/db';
import {
  formatCurrency,
  formatRelativeOrShortTime,
  formatShortDate,
  isPastDue,
  sanitizeKenyanPhone,
} from '../utils/format';
import { SPRING_PHYSICS } from '../utils/motion';
import { AnimatedCheckmark } from './AnimatedCheckmark';

interface CreditLedgerProps {
  customers: CustomerAccount[];
  creditEntries: CreditLedgerEntry[];
  role: UserRole;
  currency: string;
  shopName: string;
  mpesaTill: string;
  onLogDebtForCustomer: (customerId?: number) => void;
}

type StatusFilter = 'all' | 'owing' | 'overdue' | 'settled';
type SortOption = 'balance_desc' | 'recent' | 'name_asc';

export const CreditLedger: React.FC<CreditLedgerProps> = ({
  customers,
  creditEntries,
  role,
  currency,
  shopName,
  mpesaTill,
  onLogDebtForCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('balance_desc');
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(
    customers[0]?.id ?? null
  );
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Repayment Modal State
  const [repayTarget, setRepayTarget] = useState<CustomerAccount | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'Cash' | 'M-Pesa'>('Cash');
  const [repayMpesaRef, setRepayMpesaRef] = useState('');
  const [repayNote, setRepayNote] = useState('');
  const [repaySuccess, setRepaySuccess] = useState<{
    paid: number;
    remaining: number;
    customerName: string;
  } | null>(null);
  const [repayError, setRepayError] = useState('');

  // Edit Customer Modal (Owner-only) or Create Empty Customer Account
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerAccount | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custLandmark, setCustLandmark] = useState('');
  const [custDueDate, setCustDueDate] = useState('');

  const entriesByCustomer = useMemo(() => {
    const map = new Map<number, CreditLedgerEntry[]>();
    for (const entry of creditEntries) {
      const list = map.get(entry.customerId) || [];
      list.push(entry);
      map.set(entry.customerId, list);
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      map.set(key, list);
    }
    return map;
  }, [creditEntries]);

  const summary = useMemo(() => {
    let totalOutstanding = 0;
    let totalCollected = 0;
    let owingCount = 0;
    let overdueCount = 0;

    for (const c of customers) {
      totalOutstanding += Math.max(0, c.balance);
      totalCollected += c.totalRepaid;
      if (c.balance > 0) owingCount += 1;
      if (isPastDue(c.dueDate, c.balance)) overdueCount += 1;
    }

    return { totalOutstanding, totalCollected, owingCount, overdueCount };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (statusFilter === 'owing' && c.balance <= 0) return false;
        if (statusFilter === 'overdue' && !isPastDue(c.dueDate, c.balance)) return false;
        if (statusFilter === 'settled' && c.balance > 0) return false;

        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.landmark && c.landmark.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'balance_desc') return b.balance - a.balance;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      });
  }, [customers, searchQuery, statusFilter, sortBy]);

  const openRepaymentModal = (customer: CustomerAccount) => {
    setRepayTarget(customer);
    setRepayAmount(customer.balance > 0 ? String(Math.round(customer.balance / 2)) : '');
    setRepayMethod('Cash');
    setRepayMpesaRef('');
    setRepayNote('');
    setRepayError('');
    setRepaySuccess(null);
  };

  const handleSubmitRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayTarget?.id) return;
    const numeric = Math.round(Number(repayAmount));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setRepayError('Enter a valid repayment amount greater than zero.');
      return;
    }
    if (numeric > repayTarget.balance) {
      setRepayError(
        `Amount exceeds current customer balance (${formatCurrency(repayTarget.balance, currency)}).`
      );
      return;
    }

    try {
      const res = await recordCustomerRepayment({
        customerId: repayTarget.id,
        amount: numeric,
        paymentMethod: repayMethod,
        mpesaRef: repayMethod === 'M-Pesa' ? repayMpesaRef : undefined,
        note: repayNote,
        recordedBy: role,
      });

      setRepaySuccess({
        paid: numeric,
        remaining: res.newBalance,
        customerName: repayTarget.name,
      });
    } catch (err) {
      setRepayError(err instanceof Error ? err.message : 'Failed to save repayment.');
    }
  };

  const openEditOrCreateCustomer = (customer?: CustomerAccount) => {
    if (customer) {
      setEditingCustomer(customer);
      setCustName(customer.name);
      setCustPhone(customer.phone);
      setCustLandmark(customer.landmark || '');
      setCustDueDate(customer.dueDate || '');
    } else {
      setEditingCustomer(null);
      setCustName('');
      setCustPhone('');
      setCustLandmark('');
      setCustDueDate('');
    }
    setCustomerModalOpen(true);
  };

  const handleSaveCustomerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPhone.trim()) return;
    const now = new Date().toISOString();

    if (editingCustomer?.id) {
      await db.customers.update(editingCustomer.id, {
        name: custName.trim(),
        phone: custPhone.trim(),
        landmark: custLandmark.trim(),
        dueDate: custDueDate || undefined,
      });
    } else {
      const id = await db.customers.add({
        name: custName.trim(),
        phone: custPhone.trim(),
        landmark: custLandmark.trim(),
        totalBorrowed: 0,
        totalRepaid: 0,
        balance: 0,
        dueDate: custDueDate || undefined,
        lastActivityAt: now,
        createdAt: now,
      });
      setExpandedCustomerId(id);
    }
    setCustomerModalOpen(false);
  };

  const buildCustomerStatementText = (customer: CustomerAccount): string => {
    const history = entriesByCustomer.get(customer.id ?? -1) || [];
    const recentLines = history
      .slice(0, 5)
      .map((entry) => {
        const dt = new Date(entry.createdAt).toLocaleDateString('en-KE', {
          day: 'numeric',
          month: 'short',
        });
        if (entry.type === 'credit_sale') {
          const itemSummary = entry.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
          return `• ${dt}: Credit +${formatCurrency(entry.amount, currency)} (${itemSummary})`;
        }
        return `• ${dt}: Paid -${formatCurrency(entry.amount, currency)} (${entry.paymentMethod || 'Cash'})`;
      })
      .join('\n');

    return [
      `*${shopName} — Deni Statement*`,
      `Customer: ${customer.name} (${customer.phone})`,
      `Total Credit Taken: ${formatCurrency(customer.totalBorrowed, currency)}`,
      `Total Repaid: ${formatCurrency(customer.totalRepaid, currency)}`,
      `*Current Balance Due: ${formatCurrency(customer.balance, currency)}*`,
      customer.dueDate ? `Due Date: ${formatShortDate(customer.dueDate)}` : '',
      recentLines ? `\nRecent Activity:\n${recentLines}` : '',
      mpesaTill ? `\nPay via M-Pesa Buy Goods Till: *${mpesaTill}* — Asante!` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyStatement = async (customer: CustomerAccount) => {
    const text = buildCustomerStatementText(customer);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(customer.id ?? null);
      setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // Fallback noop if clipboard disallowed
    }
  };

  const handleWhatsAppShare = (customer: CustomerAccount) => {
    const text = buildCustomerStatementText(customer);
    const phoneDigits = sanitizeKenyanPhone(customer.phone);
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      {/* Header & Primary CTAs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            DeniTracker — Customer Credit Ledger
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Itemized neighborhood credit accounts, partial repayments &amp; WhatsApp statements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openEditOrCreateCustomer()}
            className="mtaa-btn-secondary text-xs py-2 px-3"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Customer</span>
          </button>

          <button
            type="button"
            onClick={() => onLogDebtForCustomer()}
            className="mtaa-btn-primary text-xs py-2 px-4"
          >
            <Plus className="w-4 h-4" />
            <span>Log Itemized Debt (Deni)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Active Credit Owed
          </span>
          <div
            className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
            style={{ color: 'var(--warn-text)' }}
          >
            {formatCurrency(summary.totalOutstanding, currency)}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Across {summary.owingCount} active accounts
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Total Repayments In
          </span>
          <div
            className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
            style={{ color: 'var(--profit-text)' }}
          >
            {formatCurrency(summary.totalCollected, currency)}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Cumulative recovered debt
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Overdue Promises
          </span>
          <div
            className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
            style={{
              color: summary.overdueCount > 0 ? 'var(--danger-text)' : 'var(--text-primary)',
            }}
          >
            {summary.overdueCount}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Past promised settlement date
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Registered Customers
          </span>
          <div
            className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
            style={{ color: 'var(--text-primary)' }}
          >
            {customers.length}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Stored offline on device
          </span>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="p-3.5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search customer name, phone (+254...), or stage/plot landmark..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mtaa-input pl-9 text-xs sm:text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl mtaa-surface-subtle">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'owing', label: 'Owing' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'settled', label: 'Settled' },
              ] as const
            ).map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    color: active ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="deniStatusFilterPill"
                      transition={SPRING_PHYSICS}
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
                </button>
              );
            })}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="mtaa-input w-auto text-xs py-2"
            aria-label="Sort customer accounts"
          >
            <option value="balance_desc">Sort: Highest Balance</option>
            <option value="recent">Sort: Recent Activity</option>
            <option value="name_asc">Sort: Name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Expanding Debt Accordion Cards */}
      {filteredCustomers.length === 0 ? (
        <div className="p-10 rounded-2xl mtaa-glass text-center space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            No customer credit accounts match your filter.
          </p>
          <button
            type="button"
            onClick={() => onLogDebtForCustomer()}
            className="mtaa-btn-primary text-xs"
          >
            <Plus className="w-4 h-4" /> Log First Customer Debt
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => {
            const isExpanded = expandedCustomerId === customer.id;
            const overdue = isPastDue(customer.dueDate, customer.balance);
            const settled = customer.balance <= 0;
            const history = entriesByCustomer.get(customer.id ?? -1) || [];
            const repaidPct =
              customer.totalBorrowed > 0
                ? Math.min(100, Math.round((customer.totalRepaid / customer.totalBorrowed) * 100))
                : 100;

            const initials = customer.name
              .split(' ')
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() || '')
              .join('');

            return (
              <motion.div
                key={customer.id}
                layout="position"
                transition={SPRING_PHYSICS}
                className="rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20 overflow-hidden"
              >
                {/* Accordion Header */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCustomerId(isExpanded ? null : customer.id ?? null)
                    }
                    className="flex items-start sm:items-center gap-3.5 text-left flex-1 min-w-0"
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                        settled
                          ? 'mtaa-badge-profit'
                          : overdue
                          ? 'mtaa-badge-danger'
                          : 'mtaa-badge-accent'
                      }`}
                    >
                      {initials || 'CU'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-sm sm:text-base font-bold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {customer.name}
                        </span>
                        {settled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-profit">
                            <CheckCircle2 className="w-3 h-3" /> Settled
                          </span>
                        ) : overdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-danger">
                            <AlertOctagon className="w-3 h-3" /> Overdue ({formatShortDate(customer.dueDate)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-warn">
                            <CalendarClock className="w-3 h-3" />{' '}
                            {customer.dueDate
                              ? `Due ${formatShortDate(customer.dueDate)}`
                              : 'Active Debt'}
                          </span>
                        )}
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </span>
                        {customer.landmark && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" /> {customer.landmark}
                          </span>
                        )}
                      </div>

                      {/* Repayment Progress Bar */}
                      <div className="mt-2.5 max-w-md">
                        <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                          <span>
                            Repaid {formatCurrency(customer.totalRepaid, currency)} of{' '}
                            {formatCurrency(customer.totalBorrowed, currency)}
                          </span>
                          <span className="font-bold tabular-nums">{repaidPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full mtaa-surface-subtle overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${repaidPct}%` }}
                            transition={SPRING_PHYSICS}
                            className="h-full rounded-full"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Balance + Quick Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: 'var(--border-glass)' }}>
                    <div className="sm:text-right">
                      <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Balance Owing
                      </span>
                      <span
                        className="text-lg sm:text-xl font-extrabold tabular-nums tabular-ledger"
                        style={{
                          color: settled
                            ? 'var(--profit-text)'
                            : overdue
                            ? 'var(--danger-text)'
                            : 'var(--warn-text)',
                        }}
                      >
                        {formatCurrency(customer.balance, currency)}
                      </span>
                    </div>

                    {!settled && (
                      <button
                        type="button"
                        onClick={() => openRepaymentModal(customer)}
                        className="mtaa-btn-primary text-xs py-2 px-3 shrink-0"
                      >
                        <HandCoins className="w-3.5 h-3.5" />
                        <span>Repay</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCustomerId(isExpanded ? null : customer.id ?? null)
                      }
                      aria-label="Toggle itemized history"
                      className="p-2 rounded-xl mtaa-surface-subtle"
                    >
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={SPRING_PHYSICS}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </motion.div>
                    </button>
                  </div>
                </div>

                {/* Expandable Accordion Body */}
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
                        className="px-4 sm:px-5 pb-5 pt-3 border-t space-y-4"
                        style={{ borderColor: 'var(--border-glass)' }}
                      >
                        {/* Customer Action Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onLogDebtForCustomer(customer.id)}
                              className="mtaa-btn-secondary text-xs py-1.5 px-3"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>+ Add Credit Purchase</span>
                            </button>

                            {customer.balance > 0 && (
                              <button
                                type="button"
                                onClick={() => openRepaymentModal(customer)}
                                className="mtaa-btn-secondary text-xs py-1.5 px-3"
                              >
                                <HandCoins className="w-3.5 h-3.5" />
                                <span>Record Partial Repayment</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleCopyStatement(customer)}
                              className="mtaa-btn-secondary text-xs py-1.5 px-3"
                            >
                              {copiedId === customer.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" /> Copy Statement
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleWhatsAppShare(customer)}
                              className="mtaa-btn-secondary text-xs py-1.5 px-3"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp Reminder</span>
                            </button>
                          </div>

                          {role === 'owner' && customer.id && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditOrCreateCustomer(customer)}
                                className="p-1.5 rounded-lg mtaa-surface-subtle text-xs inline-flex items-center gap-1 px-2.5"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Edit
                              </button>

                              {confirmDeleteId === customer.id ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs px-2 py-1 rounded-lg mtaa-surface-subtle"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await deleteCustomerAsOwner(customer.id!);
                                      setConfirmDeleteId(null);
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-lg font-bold mtaa-badge-danger"
                                  >
                                    Confirm Delete
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(customer.id!)}
                                  className="p-1.5 rounded-lg mtaa-badge-danger text-xs inline-flex items-center gap-1 px-2.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Itemized Transaction History Timeline */}
                        <div className="space-y-2.5">
                          <div
                            className="text-xs font-bold uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Itemized Ledger History ({history.length} entries)
                          </div>

                          {history.length === 0 ? (
                            <div className="p-4 rounded-xl mtaa-surface-subtle text-xs" style={{ color: 'var(--text-muted)' }}>
                              No credit purchases or repayments logged for this customer yet.
                            </div>
                          ) : (
                            history.map((entry) => {
                              const isCredit = entry.type === 'credit_sale';
                              return (
                                <div
                                  key={entry.id}
                                  className="p-3.5 rounded-xl mtaa-surface-subtle space-y-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                          isCredit ? 'mtaa-badge-warn' : 'mtaa-badge-profit'
                                        }`}
                                      >
                                        {isCredit
                                          ? 'Credit Taken'
                                          : `Repayment (${entry.paymentMethod || 'Cash'})`}
                                      </span>
                                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        {formatRelativeOrShortTime(entry.createdAt)} • By{' '}
                                        <span className="capitalize">{entry.recordedBy}</span>
                                      </span>
                                      {entry.mpesaRef && (
                                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded mtaa-surface-subtle">
                                          {entry.mpesaRef}
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-right">
                                      <span
                                        className="text-sm font-extrabold tabular-nums tabular-ledger"
                                        style={{
                                          color: isCredit
                                            ? 'var(--warn-text)'
                                            : 'var(--profit-text)',
                                        }}
                                      >
                                        {isCredit ? '+' : '-'}
                                        {formatCurrency(entry.amount, currency)}
                                      </span>
                                      <span
                                        className="block text-[11px] tabular-nums"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        Running Bal: {formatCurrency(entry.balanceAfter, currency)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Itemized Goods Bought */}
                                  {isCredit && entry.items.length > 0 && (
                                    <div
                                      className="pt-2 border-t space-y-1"
                                      style={{ borderColor: 'var(--border-glass)' }}
                                    >
                                      {entry.items.map((line, idx) => (
                                        <div
                                          key={`${line.name}-${idx}`}
                                          className="flex items-center justify-between text-xs"
                                        >
                                          <span style={{ color: 'var(--text-primary)' }}>
                                            {line.quantity} × {line.name}{' '}
                                            <span style={{ color: 'var(--text-muted)' }}>
                                              (@ {formatCurrency(line.unitPrice, currency)})
                                            </span>
                                          </span>
                                          <span className="font-mono font-semibold tabular-nums">
                                            {formatCurrency(line.subtotal, currency)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {entry.note && (
                                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                      Note: {entry.note}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Partial / Full Repayment Modal */}
      <AnimatePresence>
        {repayTarget && (
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
                    Record Debt Repayment
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {repayTarget.name} • Current Debt:{' '}
                    <strong>{formatCurrency(repayTarget.balance, currency)}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRepayTarget(null)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {repaySuccess ? (
                <div className="py-4">
                  <AnimatedCheckmark
                    size={64}
                    label={`Repayment Logged (${formatCurrency(repaySuccess.paid, currency)})`}
                    sublabel={
                      repaySuccess.remaining === 0
                        ? `${repaySuccess.customerName}'s credit account is now 100% settled!`
                        : `Remaining balance for ${repaySuccess.customerName}: ${formatCurrency(
                            repaySuccess.remaining,
                            currency
                          )}`
                    }
                  />
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setRepayTarget(null)}
                      className="mtaa-btn-primary text-xs px-6"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitRepayment} className="space-y-3.5">
                  {/* Preset Fractional Chips */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Quick Partial / Full Amount Presets
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: '25%', val: Math.max(1, Math.round(repayTarget.balance * 0.25)) },
                        { label: '50%', val: Math.max(1, Math.round(repayTarget.balance * 0.5)) },
                        { label: '75%', val: Math.max(1, Math.round(repayTarget.balance * 0.75)) },
                        { label: 'Clear All', val: repayTarget.balance },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setRepayAmount(String(preset.val));
                            setRepayError('');
                          }}
                          className="py-1.5 px-2 rounded-xl text-xs font-semibold mtaa-surface-subtle hover:opacity-90"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Amount Received ({currency})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={repayTarget.balance}
                      required
                      value={repayAmount}
                      onChange={(e) => {
                        setRepayAmount(e.target.value);
                        setRepayError('');
                      }}
                      className="mtaa-input text-base font-bold tabular-nums tabular-ledger"
                    />
                    {Number(repayAmount) > 0 && Number(repayAmount) <= repayTarget.balance && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--profit-text)' }}>
                        Remaining balance after payment:{' '}
                        <strong>
                          {formatCurrency(
                            Math.max(0, repayTarget.balance - Math.round(Number(repayAmount))),
                            currency
                          )}
                        </strong>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRepayMethod('Cash')}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        repayMethod === 'Cash' ? 'mtaa-badge-accent' : 'mtaa-surface-subtle'
                      }`}
                    >
                      <Banknote className="w-4 h-4" /> Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepayMethod('M-Pesa')}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        repayMethod === 'M-Pesa' ? 'mtaa-badge-accent' : 'mtaa-surface-subtle'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" /> M-Pesa
                    </button>
                  </div>

                  {repayMethod === 'M-Pesa' && (
                    <input
                      type="text"
                      maxLength={14}
                      placeholder="M-Pesa Transaction Code (e.g. SLK48M91PA)"
                      value={repayMpesaRef}
                      onChange={(e) => setRepayMpesaRef(e.target.value.toUpperCase())}
                      className="mtaa-input text-xs font-mono uppercase"
                    />
                  )}

                  <input
                    type="text"
                    placeholder="Optional note (e.g. Sent by spouse, morning installment)"
                    value={repayNote}
                    onChange={(e) => setRepayNote(e.target.value)}
                    className="mtaa-input text-xs"
                  />

                  {repayError && (
                    <p className="text-xs font-medium" style={{ color: 'var(--danger-text)' }}>
                      {repayError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRepayTarget(null)}
                      className="mtaa-btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="mtaa-btn-primary text-xs">
                      Confirm Repayment
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create / Edit Customer Profile Modal */}
      <AnimatePresence>
        {customerModalOpen && (
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
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {editingCustomer ? 'Edit Customer Profile' : 'Register Customer Account'}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomerProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Customer Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mama Njeri Wanjiku"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="mtaa-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+254 712 345 678"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="mtaa-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Stage / Plot / Landmark</label>
                  <input
                    type="text"
                    placeholder="e.g. Behind Makutano Market Stall 8"
                    value={custLandmark}
                    onChange={(e) => setCustLandmark(e.target.value)}
                    className="mtaa-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Promised Repayment Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={custDueDate}
                    onChange={(e) => setCustDueDate(e.target.value)}
                    className="mtaa-input text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(false)}
                    className="mtaa-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="mtaa-btn-primary text-xs">
                    {editingCustomer ? 'Save Changes' : 'Create Customer'}
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
