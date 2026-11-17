import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ArrowUpCircle,
  Edit3,
  Trash2,
  ShoppingCart,
  Lock,
  History,
  X,
} from 'lucide-react';
import {
  db,
  addIncomingStock,
  type InventoryItem,
  type StockMovementLog,
  type UserRole,
} from '../db/db';
import { formatCurrency, formatRelativeOrShortTime } from '../utils/format';
import { SPRING_PHYSICS } from '../utils/motion';
import { AnimatedCheckmark } from './AnimatedCheckmark';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  stockLogs: StockMovementLog[];
  role: UserRole;
  currency: string;
  onSellItem: (item: InventoryItem) => void;
}

type StockFilter = 'all' | 'low' | 'out';

const DEFAULT_CATEGORIES = [
  'Flour & Grains',
  'Cooking Oil',
  'Dairy & Bakery',
  'Sugar & Pantry',
  'Beverages',
  'Household',
  'Airtime & Utilities',
];

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  inventory,
  stockLogs,
  role,
  currency,
  onSellItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Add / Edit Product Modal (Owner Only)
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [unit, setUnit] = useState('pkt');
  const [buyingPrice, setBuyingPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockCount, setStockCount] = useState('');
  const [minStock, setMinStock] = useState('10');
  const [formError, setFormError] = useState('');

  // Restock Modal (Both Owner & Staff!)
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState('12');
  const [restockReason, setRestockReason] = useState('Wholesale Supplier Delivery');
  const [restockDone, setRestockDone] = useState<{
    name: string;
    added: number;
    newTotal: number;
  } | null>(null);

  const categories = useMemo(() => {
    const set = new Set([...DEFAULT_CATEGORIES, ...inventory.map((i) => i.category)]);
    return ['All', ...Array.from(set)];
  }, [inventory]);

  const stats = useMemo(() => {
    let lowCount = 0;
    let outCount = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;

    for (const item of inventory) {
      if (item.stock <= 0) outCount += 1;
      else if (item.stock <= item.minStock) lowCount += 1;

      totalCostValue += item.buyingPrice * item.stock;
      totalRetailValue += item.sellingPrice * item.stock;
    }

    return {
      totalSkus: inventory.length,
      lowCount,
      outCount,
      alertTotal: lowCount + outCount,
      totalCostValue,
      totalRetailValue,
      projectedProfit: totalRetailValue - totalCostValue,
    };
  }, [inventory]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory
      .filter((item) => {
        if (stockFilter === 'low' && item.stock > item.minStock) return false;
        if (stockFilter === 'out' && item.stock > 0) return false;
        if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Prioritize low-stock alerts at top
        const aRatio = a.minStock > 0 ? a.stock / a.minStock : 2;
        const bRatio = b.minStock > 0 ? b.stock / b.minStock : 2;
        return aRatio - bRatio;
      });
  }, [inventory, searchQuery, stockFilter, categoryFilter]);

  const openProductModal = (item?: InventoryItem) => {
    if (role !== 'owner') return;
    setFormError('');
    if (item) {
      setEditingItem(item);
      setSku(item.sku);
      setName(item.name);
      setCategory(item.category);
      setUnit(item.unit);
      setBuyingPrice(String(item.buyingPrice));
      setSellingPrice(String(item.sellingPrice));
      setStockCount(String(item.stock));
      setMinStock(String(item.minStock));
    } else {
      setEditingItem(null);
      const randSku = `SKU-${Math.floor(100 + Math.random() * 900)}`;
      setSku(randSku);
      setName('');
      setCategory(DEFAULT_CATEGORIES[0]);
      setUnit('pkt');
      setBuyingPrice('');
      setSellingPrice('');
      setStockCount('24');
      setMinStock('10');
    }
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'owner') return;

    const buy = Math.round(Number(buyingPrice));
    const sell = Math.round(Number(sellingPrice));
    const stock = Math.max(0, Math.round(Number(stockCount)));
    const alertMin = Math.max(1, Math.round(Number(minStock)));

    if (!name.trim()) {
      setFormError('Item name is required.');
      return;
    }
    if (!Number.isFinite(buy) || buy < 0 || !Number.isFinite(sell) || sell <= 0) {
      setFormError('Enter valid buying and selling prices.');
      return;
    }

    const now = new Date().toISOString();
    if (editingItem?.id) {
      await db.inventory.update(editingItem.id, {
        sku: sku.trim().toUpperCase() || editingItem.sku,
        name: name.trim(),
        category,
        unit: unit.trim() || 'pcs',
        buyingPrice: buy,
        sellingPrice: sell,
        stock,
        minStock: alertMin,
        updatedAt: now,
      });
    } else {
      await db.inventory.add({
        sku: sku.trim().toUpperCase() || `SKU-${Date.now().toString().slice(-4)}`,
        name: name.trim(),
        category,
        unit: unit.trim() || 'pcs',
        buyingPrice: buy,
        sellingPrice: sell,
        stock,
        minStock: alertMin,
        updatedAt: now,
      });
    }

    setProductModalOpen(false);
  };

  const openRestockModal = (item: InventoryItem) => {
    setRestockTarget(item);
    setRestockQty('12');
    setRestockReason('Incoming Supplier Delivery');
    setRestockDone(null);
  };

  const handleConfirmRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget?.id) return;
    const added = Math.round(Number(restockQty));
    if (!Number.isFinite(added) || added <= 0) return;

    await addIncomingStock({
      inventoryId: restockTarget.id,
      addedQuantity: added,
      reason: restockReason,
      recordedBy: role,
    });

    setRestockDone({
      name: restockTarget.name,
      added,
      newTotal: restockTarget.stock + added,
    });
  };

  const livePreviewMargin = useMemo(() => {
    const b = Number(buyingPrice);
    const s = Number(sellingPrice);
    if (!Number.isFinite(b) || !Number.isFinite(s) || s <= 0) return null;
    const diff = s - b;
    const pct = Math.round((diff / s) * 1000) / 10;
    return { diff, pct };
  }, [buyingPrice, sellingPrice]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Smart Inventory &amp; Stock Alerts
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Real-time shelf counts, automated low-stock badges &amp; role-protected pricing
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuditLogs((v) => !v)}
            className="mtaa-btn-secondary text-xs py-2 px-3"
          >
            <History className="w-4 h-4" />
            <span>{showAuditLogs ? 'Hide Stock Log' : 'Stock Log'}</span>
          </button>

          {role === 'owner' ? (
            <button
              type="button"
              onClick={() => openProductModal()}
              className="mtaa-btn-primary text-xs py-2 px-4"
            >
              <Plus className="w-4 h-4" />
              <span>Add Inventory Item</span>
            </button>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl mtaa-surface-subtle text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
              title="Switch to Merchant Owner role to create priced SKUs or change retail pricing"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Attendant: Restock Enabled • Pricing Locked</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Catalog SKUs
          </span>
          <div className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger">
            {stats.totalSkus}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Active tracked products
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Low Stock Warnings
          </span>
          <div
            className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
            style={{
              color: stats.alertTotal > 0 ? 'var(--warn-text)' : 'var(--profit-text)',
            }}
          >
            {stats.alertTotal}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {stats.outCount > 0 ? `${stats.outCount} out of stock` : 'Below min threshold'}
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Shelf Retail Value
          </span>
          <div className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger">
            {formatCurrency(stats.totalRetailValue, currency)}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            At current selling prices
          </span>
        </div>

        <div className="p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Stock Cost &amp; Potential Profit
          </span>
          {role === 'owner' ? (
            <>
              <div
                className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums tabular-ledger"
                style={{ color: 'var(--profit-text)' }}
              >
                +{formatCurrency(stats.projectedProfit, currency)}
              </div>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                Cost basis: {formatCurrency(stats.totalCostValue, currency)}
              </span>
            </>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Lock className="w-3.5 h-3.5" />
              <span>Owner Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Stock Movement Audit Log */}
      <AnimatePresence>
        {showAuditLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_PHYSICS}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Recent Stock Movements ({stockLogs.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {[...stockLogs]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 12)
                  .map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl mtaa-surface-subtle flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{log.itemName}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {log.reason} • {formatRelativeOrShortTime(log.createdAt)} ({log.recordedBy})
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2 tabular-nums">
                        <span
                          className="font-bold"
                          style={{
                            color: log.delta > 0 ? 'var(--profit-text)' : 'var(--warn-text)',
                          }}
                        >
                          {log.delta > 0 ? `+${log.delta}` : log.delta}
                        </span>
                        <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {log.previousStock} → {log.newStock}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Alert Filter Bar */}
      <div className="p-3.5 rounded-2xl mtaa-glass backdrop-blur-xl border border-white/20 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search SKU, product name, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mtaa-input pl-9 text-xs sm:text-sm"
            />
          </div>

          <div className="inline-flex p-1 rounded-xl mtaa-surface-subtle self-start">
            {(
              [
                { id: 'all', label: `All (${inventory.length})` },
                { id: 'low', label: `Low Stock (${stats.alertTotal})` },
                { id: 'out', label: `Out (${stats.outCount})` },
              ] as const
            ).map((f) => {
              const active = stockFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStockFilter(f.id)}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    color: active ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="invStockFilterPill"
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
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                categoryFilter === cat ? 'mtaa-badge-accent font-semibold' : 'mtaa-surface-subtle'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-10 rounded-2xl mtaa-glass text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          No inventory items match the selected filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const isOut = item.stock <= 0;
            const isLow = !isOut && item.stock <= item.minStock;
            const unitProfit = item.sellingPrice - item.buyingPrice;
            const marginPct =
              item.sellingPrice > 0
                ? Math.round((unitProfit / item.sellingPrice) * 1000) / 10
                : 0;
            const stockHealthPct = Math.min(
              100,
              Math.round((item.stock / Math.max(item.minStock * 2.5, 1)) * 100)
            );

            return (
              <motion.div
                key={item.id}
                layout="position"
                transition={SPRING_PHYSICS}
                className="p-4 sm:p-5 rounded-2xl mtaa-glow-card backdrop-blur-xl border border-white/20 flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Top Row: Category + Smart Alert Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="text-[11px] font-mono px-2 py-0.5 rounded-md mtaa-surface-subtle"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.sku} • {item.category}
                    </span>

                    {isOut ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full mtaa-badge-danger animate-pulse">
                        <AlertOctagon className="w-3 h-3" /> OUT OF STOCK
                      </span>
                    ) : isLow ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full mtaa-badge-warn">
                        <AlertTriangle className="w-3 h-3" /> LOW STOCK ({item.stock} {item.unit})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mtaa-badge-profit">
                        <CheckCircle2 className="w-3 h-3" /> In Stock
                      </span>
                    )}
                  </div>

                  {/* Product Title */}
                  <h3 className="text-base font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {item.name}
                  </h3>

                  {/* Pricing Grid (Role-Aware) */}
                  <div className="grid grid-cols-2 gap-2.5 mt-3">
                    <div className="p-2.5 rounded-xl mtaa-surface-subtle">
                      <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Selling Price / {item.unit}
                      </span>
                      <span
                        className="text-base font-extrabold tabular-nums tabular-ledger"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {formatCurrency(item.sellingPrice, currency)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl mtaa-surface-subtle">
                      <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Buying Cost &amp; Margin
                      </span>
                      {role === 'owner' ? (
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {formatCurrency(item.buyingPrice, currency)}
                          </span>
                          <span
                            className="text-xs font-extrabold tabular-nums"
                            style={{ color: 'var(--profit-text)' }}
                          >
                            +{marginPct}%
                          </span>
                        </div>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock Level Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Shelf Count:{' '}
                        <strong className="tabular-nums">
                          {item.stock} {item.unit}
                        </strong>
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        Alert ≤ {item.minStock} {item.unit}
                      </span>
                    </div>
                    <div className="h-2 rounded-full mtaa-surface-subtle overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stockHealthPct}%` }}
                        transition={SPRING_PHYSICS}
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: isOut
                            ? 'var(--danger-text)'
                            : isLow
                            ? 'var(--warn-text)'
                            : 'var(--accent-primary)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div
                  className="pt-3 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-glass)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openRestockModal(item)}
                      className="mtaa-btn-secondary text-xs py-1.5 px-2.5"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>+ Restock</span>
                    </button>

                    <button
                      type="button"
                      disabled={isOut}
                      onClick={() => onSellItem(item)}
                      className="mtaa-btn-primary text-xs py-1.5 px-3"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Sell</span>
                    </button>
                  </div>

                  {role === 'owner' && item.id && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openProductModal(item)}
                        className="p-1.5 rounded-lg mtaa-surface-subtle"
                        title="Edit item & pricing"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === item.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await db.inventory.delete(item.id!);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold mtaa-badge-danger"
                        >
                          Delete?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id!)}
                          className="p-1.5 rounded-lg mtaa-badge-danger"
                          title="Delete SKU"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Inventory Item Modal (Owner Only) */}
      <AnimatePresence>
        {productModalOpen && role === 'owner' && (
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
              className="w-full max-w-lg rounded-2xl p-5 mtaa-glass-elevated backdrop-blur-xl border border-white/20 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl mtaa-badge-accent flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                      {editingItem ? 'Edit Inventory Item & Pricing' : 'Add New Inventory Item'}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Configure cost, retail price &amp; automated low-stock alert threshold
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Product Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pembe Maize Meal 2kg"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mtaa-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">SKU Code</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      className="mtaa-input text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mtaa-input text-xs"
                    >
                      {DEFAULT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Unit (pkt, kg, L, pcs)</label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="mtaa-input text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Buying Cost ({currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      placeholder="e.g. 135"
                      value={buyingPrice}
                      onChange={(e) => setBuyingPrice(e.target.value)}
                      className="mtaa-input text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Selling Price ({currency})
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 160"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      className="mtaa-input text-xs tabular-nums"
                    />
                  </div>
                </div>

                {livePreviewMargin && (
                  <div className="p-2.5 rounded-xl mtaa-surface-subtle flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>Unit Gross Profit Preview:</span>
                    <span
                      className="font-bold tabular-nums"
                      style={{
                        color:
                          livePreviewMargin.diff >= 0 ? 'var(--profit-text)' : 'var(--danger-text)',
                      }}
                    >
                      {formatCurrency(livePreviewMargin.diff, currency)} ({livePreviewMargin.pct}%)
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium mb-1">Current Stock Count</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={stockCount}
                      onChange={(e) => setStockCount(e.target.value)}
                      className="mtaa-input text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Low-Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      className="mtaa-input text-xs tabular-nums"
                    />
                  </div>
                </div>

                {formError && (
                  <p className="text-xs font-medium" style={{ color: 'var(--danger-text)' }}>
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="mtaa-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="mtaa-btn-primary text-xs">
                    {editingItem ? 'Save Item Updates' : 'Add to Inventory'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming Stock Restock Modal (Open to Both Owner & Staff!) */}
      <AnimatePresence>
        {restockTarget && (
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
                    Add Incoming Stock
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {restockTarget.name} • Current shelf: {restockTarget.stock} {restockTarget.unit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRestockTarget(null)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {restockDone ? (
                <div className="py-3">
                  <AnimatedCheckmark
                    size={62}
                    label={`+${restockDone.added} Units Added`}
                    sublabel={`${restockDone.name} shelf count updated to ${restockDone.newTotal} ${restockTarget.unit}.`}
                  />
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setRestockTarget(null)}
                      className="mtaa-btn-primary text-xs px-6"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConfirmRestock} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Quick Bale / Crate Presets</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[6, 12, 24, 50].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRestockQty(String(preset))}
                          className="py-1.5 rounded-xl text-xs font-semibold mtaa-surface-subtle"
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Incoming Quantity ({restockTarget.unit})
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      className="mtaa-input text-base font-bold tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Delivery / Batch Note</label>
                    <input
                      type="text"
                      value={restockReason}
                      onChange={(e) => setRestockReason(e.target.value)}
                      className="mtaa-input text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRestockTarget(null)}
                      className="mtaa-btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="mtaa-btn-primary text-xs">
                      Confirm Incoming Stock
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
