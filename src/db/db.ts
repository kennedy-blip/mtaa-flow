import Dexie, { type Table } from 'dexie';
import { generateReceiptNumber } from '../utils/format';

export type ThemeMode = 'savannah' | 'midnight' | 'amber';
export type UserRole = 'owner' | 'staff';
export type AppTab = 'dashboard' | 'ledger' | 'inventory' | 'settings';

export interface InventoryItem {
  id?: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  updatedAt: string;
}

export interface SaleLineItem {
  inventoryId?: number;
  name: string;
  unit: string;
  quantity: number;
  buyingPrice: number;
  unitPrice: number;
  priceOverridden?: boolean;
  subtotal: number;
}

export interface CustomerAccount {
  id?: number;
  name: string;
  phone: string;
  landmark?: string;
  totalBorrowed: number;
  totalRepaid: number;
  balance: number;
  dueDate?: string;
  lastActivityAt: string;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id?: number;
  customerId: number;
  customerName: string;
  type: 'credit_sale' | 'repayment';
  items: SaleLineItem[];
  amount: number;
  estimatedProfit: number;
  paymentMethod?: 'Cash' | 'M-Pesa';
  mpesaRef?: string;
  balanceAfter: number;
  note?: string;
  recordedBy: UserRole;
  saleTransactionId?: number;
  createdAt: string;
}

export interface CashFlowTransaction {
  id?: number;
  receiptNo: string;
  kind: 'pos_sale' | 'credit_sale' | 'debt_repayment' | 'expense';
  paymentMethod: 'Cash' | 'M-Pesa' | 'Credit';
  mpesaRef?: string;
  customerId?: number;
  customerName?: string;
  items: SaleLineItem[];
  totalAmount: number;
  totalCost: number;
  netProfit: number;
  note?: string;
  recordedBy: UserRole;
  createdAt: string;
}

export interface StockMovementLog {
  id?: number;
  inventoryId: number;
  itemName: string;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  recordedBy: UserRole;
  createdAt: string;
}

export interface ShopSettings {
  id: string; // singleton 'app_config'
  shopName: string;
  location: string;
  merchantPhone: string;
  mpesaTill: string;
  currency: string;
  theme: ThemeMode;
  role: UserRole;
  ownerPin: string;
  requirePinForOwner: boolean;
  apkPreviewFrame: boolean;
  seededVersion: string;
}

export class MtaaFlowDB extends Dexie {
  inventory!: Table<InventoryItem, number>;
  customers!: Table<CustomerAccount, number>;
  creditEntries!: Table<CreditLedgerEntry, number>;
  transactions!: Table<CashFlowTransaction, number>;
  stockLogs!: Table<StockMovementLog, number>;
  settings!: Table<ShopSettings, string>;

  constructor() {
    super('MtaaFlowOfflineLedgerDB');
    this.version(1).stores({
      inventory: '++id, sku, name, category, stock, updatedAt',
      customers: '++id, name, phone, balance, dueDate, lastActivityAt',
      creditEntries: '++id, customerId, type, saleTransactionId, createdAt',
      transactions: '++id, receiptNo, kind, paymentMethod, customerId, createdAt',
      stockLogs: '++id, inventoryId, createdAt',
      settings: 'id',
    });
  }
}

export const db = new MtaaFlowDB();

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  id: 'app_config',
  shopName: 'MtaaFlow Duka — Makutano Stage',
  location: 'Meru Town, Kenya',
  merchantPhone: '+254 718 420 911',
  mpesaTill: '584920',
  currency: 'KSh',
  theme: 'midnight',
  role: 'owner',
  ownerPin: '2580',
  requirePinForOwner: false,
  apkPreviewFrame: false,
  seededVersion: '1.2.0',
};

export interface RecordSaleInput {
  items: SaleLineItem[];
  paymentMethod: 'Cash' | 'M-Pesa' | 'Credit';
  mpesaRef?: string;
  note?: string;
  recordedBy: UserRole;
  // Required if paymentMethod === 'Credit'
  customerId?: number;
  newCustomer?: {
    name: string;
    phone: string;
    landmark?: string;
    dueDate?: string;
  };
  dueDate?: string;
}

/**
 * Atomically records a Cash, M-Pesa, or Credit (Deni) sale:
 * - Deducts stock from linked inventory items & records StockMovementLog
 * - Updates or creates CustomerAccount + CreditLedgerEntry when on Credit
 * - Logs CashFlowTransaction for live Daily Cash & Profit Recon
 */
export async function recordSaleTransaction(input: RecordSaleInput): Promise<{
  transactionId: number;
  receiptNo: string;
  totalAmount: number;
}> {
  const now = new Date().toISOString();
  const receiptNo = generateReceiptNumber();

  const sanitizedItems = input.items.map((item) => ({
    ...item,
    subtotal: Math.round(item.unitPrice * item.quantity),
  }));

  const totalAmount = sanitizedItems.reduce((acc, i) => acc + i.subtotal, 0);
  const totalCost = sanitizedItems.reduce(
    (acc, i) => acc + Math.round(i.buyingPrice * i.quantity),
    0
  );
  const netProfit = totalAmount - totalCost;

  return db.transaction(
    'rw',
    [db.inventory, db.customers, db.creditEntries, db.transactions, db.stockLogs],
    async () => {
      // 1. Deduct inventory stock for linked items
      for (const line of sanitizedItems) {
        if (line.inventoryId) {
          const invItem = await db.inventory.get(line.inventoryId);
          if (invItem) {
            const prevStock = invItem.stock;
            const nextStock = Math.max(0, prevStock - line.quantity);
            await db.inventory.update(line.inventoryId, {
              stock: nextStock,
              updatedAt: now,
            });
            await db.stockLogs.add({
              inventoryId: line.inventoryId,
              itemName: invItem.name,
              delta: -line.quantity,
              previousStock: prevStock,
              newStock: nextStock,
              reason: input.paymentMethod === 'Credit' ? `Credit Sale (${receiptNo})` : `POS Sale (${receiptNo})`,
              recordedBy: input.recordedBy,
              createdAt: now,
            });
          }
        }
      }

      // 2. Resolve customer if Credit sale
      let resolvedCustomerId = input.customerId;
      let resolvedCustomerName = '';

      if (input.paymentMethod === 'Credit') {
        if (!resolvedCustomerId && input.newCustomer) {
          resolvedCustomerId = await db.customers.add({
            name: input.newCustomer.name.trim(),
            phone: input.newCustomer.phone.trim(),
            landmark: input.newCustomer.landmark?.trim() || '',
            totalBorrowed: 0,
            totalRepaid: 0,
            balance: 0,
            dueDate: input.newCustomer.dueDate || input.dueDate,
            lastActivityAt: now,
            createdAt: now,
          });
        }

        if (!resolvedCustomerId) {
          throw new Error('Customer is required for a credit (Deni) transaction.');
        }

        const customer = await db.customers.get(resolvedCustomerId);
        if (!customer) {
          throw new Error('Selected customer account was not found.');
        }

        resolvedCustomerName = customer.name;
        const newBorrowed = customer.totalBorrowed + totalAmount;
        const newBalance = newBorrowed - customer.totalRepaid;

        await db.customers.update(resolvedCustomerId, {
          totalBorrowed: newBorrowed,
          balance: newBalance,
          dueDate: input.dueDate || input.newCustomer?.dueDate || customer.dueDate,
          lastActivityAt: now,
        });

        // 3. Insert unified CashFlowTransaction first so we can link its ID
        const txId = await db.transactions.add({
          receiptNo,
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: resolvedCustomerId,
          customerName: resolvedCustomerName,
          items: sanitizedItems,
          totalAmount,
          totalCost,
          netProfit,
          note: input.note?.trim() || '',
          recordedBy: input.recordedBy,
          createdAt: now,
        });

        // 4. Insert itemized CreditLedgerEntry
        await db.creditEntries.add({
          customerId: resolvedCustomerId,
          customerName: resolvedCustomerName,
          type: 'credit_sale',
          items: sanitizedItems,
          amount: totalAmount,
          estimatedProfit: netProfit,
          balanceAfter: newBalance,
          note: input.note?.trim() || `Receipt ${receiptNo}`,
          recordedBy: input.recordedBy,
          saleTransactionId: txId,
          createdAt: now,
        });

        return { transactionId: txId, receiptNo, totalAmount };
      }

      // Direct Cash or M-Pesa POS Sale
      const txId = await db.transactions.add({
        receiptNo,
        kind: 'pos_sale',
        paymentMethod: input.paymentMethod,
        mpesaRef: input.mpesaRef?.trim().toUpperCase() || undefined,
        items: sanitizedItems,
        totalAmount,
        totalCost,
        netProfit,
        note: input.note?.trim() || '',
        recordedBy: input.recordedBy,
        createdAt: now,
      });

      return { transactionId: txId, receiptNo, totalAmount };
    }
  );
}

export interface RecordRepaymentInput {
  customerId: number;
  amount: number;
  paymentMethod: 'Cash' | 'M-Pesa';
  mpesaRef?: string;
  note?: string;
  recordedBy: UserRole;
}

/**
 * Records a partial or full debt repayment against a customer's credit balance:
 * - Reduces customer balance & updates lastActivityAt
 * - Logs itemized repayment in CreditLedgerEntry
 * - Logs CashFlowTransaction ('debt_repayment') so Daily Cash Collected updates immediately
 */
export async function recordCustomerRepayment(input: RecordRepaymentInput): Promise<{
  receiptNo: string;
  newBalance: number;
}> {
  const now = new Date().toISOString();
  const receiptNo = generateReceiptNumber();

  return db.transaction('rw', [db.customers, db.creditEntries, db.transactions], async () => {
    const customer = await db.customers.get(input.customerId);
    if (!customer) {
      throw new Error('Customer not found.');
    }

    const cleanAmount = Math.min(Math.round(input.amount), Math.max(customer.balance, Math.round(input.amount)));
    if (cleanAmount <= 0) {
      throw new Error('Repayment amount must be greater than zero.');
    }

    const updatedRepaid = customer.totalRepaid + cleanAmount;
    const updatedBalance = Math.max(0, customer.totalBorrowed - updatedRepaid);

    await db.customers.update(input.customerId, {
      totalRepaid: updatedRepaid,
      balance: updatedBalance,
      dueDate: updatedBalance === 0 ? undefined : customer.dueDate,
      lastActivityAt: now,
    });

    const txId = await db.transactions.add({
      receiptNo,
      kind: 'debt_repayment',
      paymentMethod: input.paymentMethod,
      mpesaRef: input.mpesaRef?.trim().toUpperCase() || undefined,
      customerId: input.customerId,
      customerName: customer.name,
      items: [],
      totalAmount: cleanAmount,
      totalCost: 0,
      netProfit: 0, // Profit was already accounted at sale time; no double counting
      note: input.note?.trim() || `Deni repayment (${customer.name})`,
      recordedBy: input.recordedBy,
      createdAt: now,
    });

    await db.creditEntries.add({
      customerId: input.customerId,
      customerName: customer.name,
      type: 'repayment',
      items: [],
      amount: cleanAmount,
      estimatedProfit: 0,
      paymentMethod: input.paymentMethod,
      mpesaRef: input.mpesaRef?.trim().toUpperCase() || undefined,
      balanceAfter: updatedBalance,
      note: input.note?.trim() || `Paid via ${input.paymentMethod}`,
      recordedBy: input.recordedBy,
      saleTransactionId: txId,
      createdAt: now,
    });

    return { receiptNo, newBalance: updatedBalance };
  });
}

/**
 * Logs a daily shop operating expense (e.g., packaging bags, boda delivery, electricity token)
 * so Net Estimated Profit reflects true take-home shop margin.
 */
export async function recordShopExpense(input: {
  description: string;
  amount: number;
  paymentMethod: 'Cash' | 'M-Pesa';
  recordedBy: UserRole;
}): Promise<void> {
  const now = new Date().toISOString();
  const cleanAmount = Math.round(input.amount);
  if (cleanAmount <= 0) return;

  await db.transactions.add({
    receiptNo: generateReceiptNumber(),
    kind: 'expense',
    paymentMethod: input.paymentMethod,
    items: [],
    totalAmount: cleanAmount,
    totalCost: cleanAmount,
    netProfit: -cleanAmount,
    note: input.description.trim(),
    recordedBy: input.recordedBy,
    createdAt: now,
  });
}

/**
 * Adds incoming stock to an inventory item (permitted for both Merchant Owner & Shop Attendant).
 */
export async function addIncomingStock(input: {
  inventoryId: number;
  addedQuantity: number;
  reason?: string;
  recordedBy: UserRole;
}): Promise<void> {
  const now = new Date().toISOString();
  const qty = Math.round(input.addedQuantity);
  if (qty <= 0) return;

  await db.transaction('rw', [db.inventory, db.stockLogs], async () => {
    const item = await db.inventory.get(input.inventoryId);
    if (!item) throw new Error('Item not found.');

    const nextStock = item.stock + qty;
    await db.inventory.update(input.inventoryId, {
      stock: nextStock,
      updatedAt: now,
    });

    await db.stockLogs.add({
      inventoryId: input.inventoryId,
      itemName: item.name,
      delta: qty,
      previousStock: item.stock,
      newStock: nextStock,
      reason: input.reason?.trim() || 'Incoming Stock Restock',
      recordedBy: input.recordedBy,
      createdAt: now,
    });
  });
}

/**
 * Owner-only: Void/delete a transaction and cleanly reverse stock & credit balances.
 */
export async function voidTransactionAsOwner(transactionId: number): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [db.transactions, db.inventory, db.stockLogs, db.customers, db.creditEntries],
    async () => {
      const tx = await db.transactions.get(transactionId);
      if (!tx) return;

      // Restore inventory stock if sale had linked items
      if (tx.kind === 'pos_sale' || tx.kind === 'credit_sale') {
        for (const line of tx.items) {
          if (line.inventoryId) {
            const item = await db.inventory.get(line.inventoryId);
            if (item) {
              const restored = item.stock + line.quantity;
              await db.inventory.update(line.inventoryId, {
                stock: restored,
                updatedAt: now,
              });
              await db.stockLogs.add({
                inventoryId: line.inventoryId,
                itemName: item.name,
                delta: line.quantity,
                previousStock: item.stock,
                newStock: restored,
                reason: `Voided ${tx.receiptNo}`,
                recordedBy: 'owner',
                createdAt: now,
              });
            }
          }
        }
      }

      // Reverse customer credit balance if credit sale or repayment
      if (tx.customerId) {
        const customer = await db.customers.get(tx.customerId);
        if (customer) {
          if (tx.kind === 'credit_sale') {
            const nextBorrowed = Math.max(0, customer.totalBorrowed - tx.totalAmount);
            const nextBalance = Math.max(0, nextBorrowed - customer.totalRepaid);
            await db.customers.update(tx.customerId, {
              totalBorrowed: nextBorrowed,
              balance: nextBalance,
              lastActivityAt: now,
            });
          } else if (tx.kind === 'debt_repayment') {
            const nextRepaid = Math.max(0, customer.totalRepaid - tx.totalAmount);
            const nextBalance = Math.max(0, customer.totalBorrowed - nextRepaid);
            await db.customers.update(tx.customerId, {
              totalRepaid: nextRepaid,
              balance: nextBalance,
              lastActivityAt: now,
            });
          }
        }
        await db.creditEntries.where('saleTransactionId').equals(transactionId).delete();
      }

      await db.transactions.delete(transactionId);
    }
  );
}

/**
 * Owner-only: Delete a customer account and its associated credit entries.
 */
export async function deleteCustomerAsOwner(customerId: number): Promise<void> {
  await db.transaction('rw', [db.customers, db.creditEntries], async () => {
    await db.creditEntries.where('customerId').equals(customerId).delete();
    await db.customers.delete(customerId);
  });
}

export interface FullBackupPayload {
  app: 'MtaaFlow';
  version: string;
  exportedAt: string;
  settings: ShopSettings[];
  inventory: InventoryItem[];
  customers: CustomerAccount[];
  creditEntries: CreditLedgerEntry[];
  transactions: CashFlowTransaction[];
  stockLogs: StockMovementLog[];
}

export async function exportFullLedgerBackup(): Promise<FullBackupPayload> {
  const [settings, inventory, customers, creditEntries, transactions, stockLogs] =
    await Promise.all([
      db.settings.toArray(),
      db.inventory.toArray(),
      db.customers.toArray(),
      db.creditEntries.toArray(),
      db.transactions.toArray(),
      db.stockLogs.toArray(),
    ]);

  return {
    app: 'MtaaFlow',
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    settings,
    inventory,
    customers,
    creditEntries,
    transactions,
    stockLogs,
  };
}

export async function importFullLedgerBackup(payload: FullBackupPayload): Promise<void> {
  if (!payload || payload.app !== 'MtaaFlow' || !Array.isArray(payload.inventory)) {
    throw new Error('Invalid MtaaFlow backup file.');
  }

  await db.transaction(
    'rw',
    [db.settings, db.inventory, db.customers, db.creditEntries, db.transactions, db.stockLogs],
    async () => {
      await Promise.all([
        db.inventory.clear(),
        db.customers.clear(),
        db.creditEntries.clear(),
        db.transactions.clear(),
        db.stockLogs.clear(),
      ]);

      if (payload.settings?.length) {
        await db.settings.bulkPut(payload.settings);
      }
      if (payload.inventory?.length) {
        await db.inventory.bulkAdd(payload.inventory);
      }
      if (payload.customers?.length) {
        await db.customers.bulkAdd(payload.customers);
      }
      if (payload.creditEntries?.length) {
        await db.creditEntries.bulkAdd(payload.creditEntries);
      }
      if (payload.transactions?.length) {
        await db.transactions.bulkAdd(payload.transactions);
      }
      if (payload.stockLogs?.length) {
        await db.stockLogs.bulkAdd(payload.stockLogs);
      }
    }
  );
}
