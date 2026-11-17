import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Banknote,
  Smartphone,
  BookOpenCheck,
  Lock,
  UserPlus,
  Users,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  recordSaleTransaction,
  type InventoryItem,
  type CustomerAccount,
  type SaleLineItem,
  type UserRole,
} from '../db/db';
import { formatCurrency } from '../utils/format';
import { SPRING_PHYSICS } from '../utils/motion';
import { AnimatedCheckmark } from './AnimatedCheckmark';

interface QuickSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  customers: CustomerAccount[];
  role: UserRole;
  currency: string;
  initialMode?: 'Cash' | 'M-Pesa' | 'Credit';
  preselectedCustomerId?: number;
  preselectedItem?: InventoryItem | null;
}

export const QuickSaleModal: React.FC<QuickSaleModalProps> = ({
  isOpen,
  onClose,
  inventory,
  customers,
  role,
  currency,
  initialMode = 'Cash',
  preselectedCustomerId,
  preselectedItem = null,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<SaleLineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'M-Pesa' | 'Credit'>(initialMode);
  const [mpesaRef, setMpesaRef] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [note, setNote] = useState('');

  // Credit customer fields
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLandmark, setNewCustomerLandmark] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Custom unlisted item entry
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [customQty, setCustomQty] = useState('1');

  // Submission & completion state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [completedReceipt, setCompletedReceipt] = useState<{
    receiptNo: string;
    totalAmount: number;
    mode: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(initialMode);
      setErrorMsg('');
      setCompletedReceipt(null);
      setMpesaRef('');
      setCashTendered('');
      setNote('');

      if (preselectedCustomerId) {
        setCustomerMode('existing');
        setSelectedCustomerId(preselectedCustomerId);
      } else if (customers.length > 0) {
        setCustomerMode('existing');
        setSelectedCustomerId(customers[0].id ?? '');
      } else {
        setCustomerMode('new');
        setSelectedCustomerId('');
      }

      if (preselectedItem) {
        setCart([
          {
            inventoryId: preselectedItem.id,
            name: preselectedItem.name,
            unit: preselectedItem.unit,
            quantity: 1,
            buyingPrice: preselectedItem.buyingPrice,
            unitPrice: preselectedItem.sellingPrice,
            subtotal: preselectedItem.sellingPrice,
          },
        ]);
      } else {
        setCart([]);
      }
    }
  }, [isOpen, initialMode, preselectedCustomerId, preselectedItem, customers]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(inventory.map((i) => i.category)));
    return ['All', ...unique];
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [inventory, searchQuery, selectedCategory]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + Math.round(line.unitPrice * line.quantity), 0),
    [cart]
  );

  const estimatedProfit = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + Math.round((line.unitPrice - line.buyingPrice) * line.quantity),
        0
      ),
    [cart]
  );

  const changeDue = useMemo(() => {
    const tendered = Number(cashTendered);
    if (!Number.isFinite(tendered) || tendered <= cartTotal) return 0;
    return Math.round(tendered - cartTotal);
  }, [cashTendered, cartTotal]);

  const addInventoryToCart = (item: InventoryItem) => {
    setErrorMsg('');
    setCart((prev) => {
      const existingIndex = prev.findIndex((line) => line.inventoryId === item.id);
      if (existingIndex >= 0) {
        const current = prev[existingIndex];
        const nextQty = current.quantity + 1;
        const copy = [...prev];
        copy[existingIndex] = {
          ...current,
          quantity: nextQty,
          subtotal: Math.round(current.unitPrice * nextQty),
        };
        return copy;
      }
      return [
        ...prev,
        {
          inventoryId: item.id,
          name: item.name,
          unit: item.unit,
          quantity: 1,
          buyingPrice: item.buyingPrice,
          unitPrice: item.sellingPrice,
          subtotal: item.sellingPrice,
        },
      ];
    });
  };

  const updateLineQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((_, idx) => idx !== index);
      }
      const next = [...prev];
      next[index] = {
        ...line,
        quantity: nextQty,
        subtotal: Math.round(line.unitPrice * nextQty),
      };
      return next;
    });
  };

  const handleOwnerPriceOverride = (index: number, rawValue: string) => {
    if (role !== 'owner') return;
    const numeric = Math.max(0, Number(rawValue) || 0);
    setCart((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const next = [...prev];
      next[index] = {
        ...line,
        unitPrice: numeric,
        priceOverridden: true,
        subtotal: Math.round(numeric * line.quantity),
      };
      return next;
    });
  };

  const removeLine = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(customPrice);
    const qty = Math.max(1, Number(customQty) || 1);
    if (!customName.trim() || !Number.isFinite(price) || price <= 0) {
      setErrorMsg('Enter a valid item name and selling price.');
      return;
    }
    const cost =
      role === 'owner' && customCost.trim() !== ''
        ? Math.max(0, Number(customCost) || 0)
        : Math.round(price * 0.82);

    setCart((prev) => [
      ...prev,
      {
        name: customName.trim(),
        unit: 'pcs',
        quantity: qty,
        buyingPrice: cost,
        unitPrice: price,
        subtotal: Math.round(price * qty),
      },
    ]);

    setCustomName('');
    setCustomPrice('');
    setCustomCost('');
    setCustomQty('1');
    setShowCustomForm(false);
    setErrorMsg('');
  };

  const handleCompleteSale = async () => {
    setErrorMsg('');
    if (cart.length === 0) {
      setErrorMsg('Add at least one item to the basket before completing the transaction.');
      return;
    }

    if (paymentMethod === 'Credit') {
      if (customerMode === 'existing' && !selectedCustomerId) {
        setErrorMsg('Select a customer account or switch to "New Customer".');
        return;
      }
      if (customerMode === 'new') {
        if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
          setErrorMsg('Customer full name and phone number are required to log Deni credit.');
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      const result = await recordSaleTransaction({
        items: cart,
        paymentMethod,
        mpesaRef: paymentMethod === 'M-Pesa' ? mpesaRef : undefined,
        note,
        recordedBy: role,
        customerId:
          paymentMethod === 'Credit' && customerMode === 'existing' && selectedCustomerId
            ? Number(selectedCustomerId)
            : undefined,
        newCustomer:
          paymentMethod === 'Credit' && customerMode === 'new'
            ? {
                name: newCustomerName,
                phone: newCustomerPhone,
                landmark: newCustomerLandmark,
                dueDate: dueDate || undefined,
              }
            : undefined,
        dueDate: paymentMethod === 'Credit' && dueDate ? dueDate : undefined,
      });

      setCompletedReceipt({
        receiptNo: result.receiptNo,
        totalAmount: result.totalAmount,
        mode: paymentMethod === 'Credit' ? 'Credit (Deni Ledger)' : paymentMethod,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save transaction.');
    } finally {
      setSubmitting(false);
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
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.96, opacity: 0 }}
            transition={SPRING_PHYSICS}
            className="w-full max-w-5xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl mtaa-glass-elevated backdrop-blur-xl border border-white/20 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl mtaa-badge-accent flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {paymentMethod === 'Credit'
                      ? 'Log Itemized Customer Credit (Deni)'
                      : 'Quick POS & Credit Checkout'}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    100% Offline IndexedDB • Auto-updates stock & daily cash recon
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl mtaa-surface-subtle hover:opacity-80"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {completedReceipt ? (
              <div className="p-8 flex flex-col items-center justify-center">
                <AnimatedCheckmark
                  size={74}
                  label={`Transaction Recorded • ${completedReceipt.receiptNo}`}
                  sublabel={`${formatCurrency(
                    completedReceipt.totalAmount,
                    currency
                  )} logged under ${completedReceipt.mode}. Inventory & daily cash recon updated offline.`}
                />
                <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedReceipt(null);
                      setCart([]);
                      setCashTendered('');
                      setMpesaRef('');
                      setNote('');
                    }}
                    className="mtaa-btn-secondary text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Record Another Sale
                  </button>
                  <button type="button" onClick={onClose} className="mtaa-btn-primary text-sm">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
                {/* Left Column: Catalog Picker */}
                <div
                  className="lg:col-span-7 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r flex flex-col gap-3.5"
                  style={{ borderColor: 'var(--border-glass)' }}
                >
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search item name or SKU (e.g. Jogoo, Milk, Oil)..."
                        className="mtaa-input pl-9"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCustomForm((v) => !v)}
                      className="mtaa-btn-secondary text-xs whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Unlisted Item
                    </button>
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {categories.map((cat) => {
                      const active = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            active ? 'mtaa-badge-accent font-semibold' : 'mtaa-surface-subtle'
                          }`}
                          style={{
                            color: active ? undefined : 'var(--text-secondary)',
                          }}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Unlisted Item Inline Form */}
                  <AnimatePresence>
                    {showCustomForm && (
                      <motion.form
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING_PHYSICS}
                        onSubmit={handleAddCustomItem}
                        className="overflow-hidden"
                      >
                        <div className="p-3.5 rounded-2xl mtaa-surface-subtle space-y-2.5">
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                            Add Custom / Loose Market Item
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input
                              type="text"
                              placeholder="Item name (e.g. Sukuma)"
                              value={customName}
                              onChange={(e) => setCustomName(e.target.value)}
                              className="mtaa-input col-span-2 text-xs"
                            />
                            <input
                              type="number"
                              min="1"
                              placeholder={`Price (${currency})`}
                              value={customPrice}
                              onChange={(e) => setCustomPrice(e.target.value)}
                              className="mtaa-input text-xs tabular-nums"
                            />
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={customQty}
                              onChange={(e) => setCustomQty(e.target.value)}
                              className="mtaa-input text-xs tabular-nums"
                            />
                          </div>
                          {role === 'owner' && (
                            <input
                              type="number"
                              min="0"
                              placeholder={`Optional buying cost per unit (${currency})`}
                              value={customCost}
                              onChange={(e) => setCustomCost(e.target.value)}
                              className="mtaa-input text-xs tabular-nums"
                            />
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setShowCustomForm(false)}
                              className="mtaa-btn-secondary text-xs py-1.5 px-3"
                            >
                              Cancel
                            </button>
                            <button type="submit" className="mtaa-btn-primary text-xs py-1.5 px-3">
                              Add to Basket
                            </button>
                          </div>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Product Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] lg:max-h-[420px] overflow-y-auto pr-1">
                    {filteredInventory.map((item) => {
                      const inCart = cart.find((c) => c.inventoryId === item.id);
                      const isLow = item.stock <= item.minStock;
                      const outOfStock = item.stock <= 0;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => addInventoryToCart(item)}
                          className={`text-left p-3 rounded-2xl mtaa-surface-subtle transition-all flex items-center justify-between gap-2 ${
                            outOfStock ? 'opacity-45 cursor-not-allowed' : 'hover:scale-[1.01]'
                          }`}
                          style={{
                            borderColor: inCart ? 'var(--accent-primary)' : undefined,
                          }}
                        >
                          <div className="min-w-0">
                            <div
                              className="text-xs sm:text-sm font-semibold truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {item.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="text-xs font-bold tabular-nums tabular-ledger"
                                style={{ color: 'var(--accent-primary)' }}
                              >
                                {formatCurrency(item.sellingPrice, currency)}
                              </span>
                              <span
                                className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium tabular-nums ${
                                  outOfStock
                                    ? 'mtaa-badge-danger'
                                    : isLow
                                    ? 'mtaa-badge-warn'
                                    : 'mtaa-surface-subtle'
                                }`}
                              >
                                {outOfStock ? 'Out of stock' : `${item.stock} ${item.unit}`}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {inCart ? (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold mtaa-badge-accent tabular-nums">
                                ×{inCart.quantity}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg mtaa-surface-subtle">
                                <Plus className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Itemized Basket & Payment Mode */}
                <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-4">
                    {/* Payment Method Selector */}
                    <div>
                      <label
                        className="block text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Payment / Settlement Mode
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'Cash', label: 'Cash', icon: Banknote },
                            { id: 'M-Pesa', label: 'M-Pesa', icon: Smartphone },
                            { id: 'Credit', label: 'Deni (Credit)', icon: BookOpenCheck },
                          ] as const
                        ).map((pm) => {
                          const Icon = pm.icon;
                          const active = paymentMethod === pm.id;
                          return (
                            <button
                              key={pm.id}
                              type="button"
                              onClick={() => setPaymentMethod(pm.id)}
                              className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
                                active ? 'mtaa-badge-accent' : 'mtaa-surface-subtle'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                              <span>{pm.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conditional Customer Assignment for Credit (Deni) */}
                    {paymentMethod === 'Credit' && (
                      <div className="p-3.5 rounded-2xl mtaa-surface-subtle space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                            Assign Customer Account
                          </span>
                          <div className="inline-flex rounded-lg p-0.5 mtaa-surface-subtle">
                            <button
                              type="button"
                              onClick={() => setCustomerMode('existing')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                                customerMode === 'existing' ? 'mtaa-badge-accent' : ''
                              }`}
                            >
                              <Users className="w-3 h-3" /> Existing
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerMode('new')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                                customerMode === 'new' ? 'mtaa-badge-accent' : ''
                              }`}
                            >
                              <UserPlus className="w-3 h-3" /> New
                            </button>
                          </div>
                        </div>

                        {customerMode === 'existing' ? (
                          <div className="space-y-2">
                            <select
                              value={selectedCustomerId}
                              onChange={(e) =>
                                setSelectedCustomerId(e.target.value ? Number(e.target.value) : '')
                              }
                              className="mtaa-input text-xs"
                            >
                              <option value="">-- Choose customer --</option>
                              {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.phone}) • Owing {formatCurrency(c.balance, currency)}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                Promised Due Date:
                              </span>
                              <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="mtaa-input text-xs py-1.5"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Customer Full Name (e.g. Mama Wanja)"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              className="mtaa-input text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="tel"
                                placeholder="Phone (+254 7...)"
                                value={newCustomerPhone}
                                onChange={(e) => setNewCustomerPhone(e.target.value)}
                                className="mtaa-input text-xs"
                              />
                              <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="mtaa-input text-xs"
                                title="Promised repayment date"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Stage / Plot / Landmark (optional)"
                              value={newCustomerLandmark}
                              onChange={(e) => setNewCustomerLandmark(e.target.value)}
                              className="mtaa-input text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* M-Pesa Reference Input */}
                    {paymentMethod === 'M-Pesa' && (
                      <div>
                        <input
                          type="text"
                          maxLength={14}
                          placeholder="Optional M-Pesa Code (e.g. SLK84M9P2Q)"
                          value={mpesaRef}
                          onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                          className="mtaa-input text-xs font-mono uppercase"
                        />
                      </div>
                    )}

                    {/* Itemized Cart Lines */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Itemized Basket ({cart.reduce((s, i) => s + i.quantity, 0)} units)
                        </span>
                        {role === 'owner' ? (
                          <span className="text-[11px] mtaa-badge-accent px-2 py-0.5 rounded-full font-medium">
                            Owner Price Override Unlocked
                          </span>
                        ) : (
                          <span
                            className="text-[11px] inline-flex items-center gap-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Lock className="w-3 h-3" /> Retail prices locked
                          </span>
                        )}
                      </div>

                      {cart.length === 0 ? (
                        <div
                          className="p-6 rounded-2xl mtaa-surface-subtle text-center text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Tap items from the catalog on the left to build an itemized receipt.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                          {cart.map((line, index) => (
                            <div
                              key={`${line.inventoryId ?? line.name}-${index}`}
                              className="p-2.5 rounded-xl mtaa-surface-subtle flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div
                                  className="text-xs font-semibold truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {line.name}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {role === 'owner' ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                        @
                                      </span>
                                      <input
                                        type="number"
                                        min="1"
                                        value={line.unitPrice}
                                        onChange={(e) =>
                                          handleOwnerPriceOverride(index, e.target.value)
                                        }
                                        className="w-20 px-1.5 py-0.5 rounded-md text-xs font-mono tabular-nums mtaa-input"
                                        title="Owner price override"
                                      />
                                    </div>
                                  ) : (
                                    <span
                                      className="text-[11px] font-mono tabular-nums"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      @ {formatCurrency(line.unitPrice, currency)}
                                    </span>
                                  )}
                                  <span
                                    className="text-xs font-bold tabular-nums ml-auto"
                                    style={{ color: 'var(--accent-primary)' }}
                                  >
                                    {formatCurrency(line.subtotal, currency)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateLineQuantity(index, -1)}
                                  className="w-6 h-6 rounded-lg mtaa-surface-subtle flex items-center justify-center"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-6 text-center text-xs font-bold tabular-nums">
                                  {line.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateLineQuantity(index, 1)}
                                  className="w-6 h-6 rounded-lg mtaa-surface-subtle flex items-center justify-center"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLine(index)}
                                  className="w-6 h-6 rounded-lg mtaa-badge-danger flex items-center justify-center ml-1"
                                  title="Remove line"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cash Tendered & Change Calculator */}
                    {paymentMethod === 'Cash' && cart.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 items-center p-2.5 rounded-xl mtaa-surface-subtle">
                        <div>
                          <label className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            Cash Given (Optional)
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder={`e.g. ${Math.ceil(cartTotal / 100) * 100}`}
                            value={cashTendered}
                            onChange={(e) => setCashTendered(e.target.value)}
                            className="mtaa-input text-xs py-1 mt-0.5 tabular-nums"
                          />
                        </div>
                        <div className="text-right">
                          <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            Change to Return
                          </span>
                          <span
                            className="text-sm font-bold tabular-nums tabular-ledger"
                            style={{ color: 'var(--profit-text)' }}
                          >
                            {formatCurrency(changeDue, currency)}
                          </span>
                        </div>
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Optional transaction note..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="mtaa-input text-xs"
                    />
                  </div>

                  {/* Totals & Submit */}
                  <div
                    className="pt-3 border-t space-y-3"
                    style={{ borderColor: 'var(--border-glass)' }}
                  >
                    {errorMsg && (
                      <div className="p-2.5 rounded-xl mtaa-badge-danger text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>
                          Total Payable ({paymentMethod})
                        </span>
                        {role === 'owner' && cart.length > 0 && (
                          <span
                            className="text-[11px] font-semibold tabular-nums"
                            style={{ color: 'var(--profit-text)' }}
                          >
                            Est. Margin: +{formatCurrency(estimatedProfit, currency)}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-2xl font-extrabold tabular-nums tabular-ledger"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {formatCurrency(cartTotal, currency)}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={submitting || cart.length === 0}
                      onClick={handleCompleteSale}
                      className="w-full mtaa-btn-primary py-3 text-sm"
                    >
                      {submitting
                        ? 'Saving to Offline Ledger...'
                        : paymentMethod === 'Credit'
                        ? `Log ${formatCurrency(cartTotal, currency)} to DeniTracker`
                        : `Complete ${paymentMethod} Sale • ${formatCurrency(cartTotal, currency)}`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
