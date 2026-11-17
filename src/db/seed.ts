import {
  db,
  DEFAULT_SHOP_SETTINGS,
  type InventoryItem,
  type CustomerAccount,
  type CreditLedgerEntry,
  type CashFlowTransaction,
  type StockMovementLog,
} from './db';

function todayAtOffsetMinutes(minutesAgo: number): string {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 30, 0);
  const candidate = new Date(now.getTime() - minutesAgo * 60 * 1000);
  if (candidate.getTime() < startOfDay.getTime()) {
    // Keep "today" seed records strictly inside today's local date even right after midnight
    const safeOffset = Math.max(1, Math.min(minutesAgo, 25));
    return new Date(now.getTime() - safeOffset * 60 * 1000).toISOString();
  }
  return candidate.toISOString();
}

function daysAgoIso(daysAgo: number, hour = 14, minute = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOffsetYmd(daysDelta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysDelta);
  return d.toISOString().slice(0, 10);
}

export async function ensureDatabaseSeeded(): Promise<void> {
  const existingConfig = await db.settings.get('app_config');
  if (existingConfig) {
    return;
  }
  await resetWithRealisticDemoData(true);
}

export async function resetWithRealisticDemoData(preserveSettings = false): Promise<void> {
  const currentConfig = preserveSettings ? null : await db.settings.get('app_config');
  const nowIso = new Date().toISOString();

  const inventorySeed: InventoryItem[] = [
    {
      sku: 'FLR-JOG-2KG',
      name: 'Jogoo Maize Meal 2kg',
      category: 'Flour & Grains',
      unit: 'pkt',
      buyingPrice: 135,
      sellingPrice: 160,
      stock: 38,
      minStock: 12,
      updatedAt: nowIso,
    },
    {
      sku: 'FLR-PMB-2KG',
      name: 'Pembe All-Purpose Wheat 2kg',
      category: 'Flour & Grains',
      unit: 'pkt',
      buyingPrice: 155,
      sellingPrice: 185,
      stock: 5, // Low stock!
      minStock: 10,
      updatedAt: nowIso,
    },
    {
      sku: 'OIL-FFR-1L',
      name: 'Fresh Fri Vegetable Oil 1L',
      category: 'Cooking Oil',
      unit: 'L',
      buyingPrice: 265,
      sellingPrice: 310,
      stock: 4, // Critical low stock!
      minStock: 10,
      updatedAt: nowIso,
    },
    {
      sku: 'DRY-TUZ-500',
      name: 'Brookside Tuzo Milk 500ml',
      category: 'Dairy & Bakery',
      unit: 'pkt',
      buyingPrice: 52,
      sellingPrice: 65,
      stock: 7, // Low stock!
      minStock: 18,
      updatedAt: nowIso,
    },
    {
      sku: 'SUG-KBR-1KG',
      name: 'Kabras White Sugar 1kg',
      category: 'Sugar & Pantry',
      unit: 'kg',
      buyingPrice: 140,
      sellingPrice: 170,
      stock: 28,
      minStock: 10,
      updatedAt: nowIso,
    },
    {
      sku: 'BKR-SUP-400',
      name: 'Supa Loaf White Bread 400g',
      category: 'Dairy & Bakery',
      unit: 'loaf',
      buyingPrice: 55,
      sellingPrice: 65,
      stock: 19,
      minStock: 8,
      updatedAt: nowIso,
    },
    {
      sku: 'FLR-PSH-1KG',
      name: 'Mwea Pishori Rice Grade 1 (1kg)',
      category: 'Flour & Grains',
      unit: 'kg',
      buyingPrice: 165,
      sellingPrice: 210,
      stock: 31,
      minStock: 10,
      updatedAt: nowIso,
    },
    {
      sku: 'BEV-KTP-100',
      name: 'Ketepa Pride Tea Leaves 100g',
      category: 'Beverages',
      unit: 'pkt',
      buyingPrice: 58,
      sellingPrice: 75,
      stock: 22,
      minStock: 8,
      updatedAt: nowIso,
    },
    {
      sku: 'HSH-MNG-800',
      name: 'Menengai Cream Laundry Bar 800g',
      category: 'Household',
      unit: 'bar',
      buyingPrice: 145,
      sellingPrice: 180,
      stock: 3, // Critical low stock!
      minStock: 8,
      updatedAt: nowIso,
    },
    {
      sku: 'AIR-SAF-100',
      name: 'Safaricom Scratch Airtime 100',
      category: 'Airtime & Utilities',
      unit: 'pcs',
      buyingPrice: 95,
      sellingPrice: 100,
      stock: 45,
      minStock: 15,
      updatedAt: nowIso,
    },
  ];

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

      await db.settings.put(
        currentConfig
          ? { ...currentConfig, seededVersion: '1.2.0' }
          : { ...DEFAULT_SHOP_SETTINGS }
      );

      const itemIds = (await db.inventory.bulkAdd(inventorySeed, {
        allKeys: true,
      })) as number[];

      // Seed realistic customers
      const customersSeed: CustomerAccount[] = [
        {
          name: 'Mama Njeri Wanjiku',
          phone: '+254 712 348 910',
          landmark: 'Plot 12, Behind Catholic Church',
          totalBorrowed: 1380,
          totalRepaid: 500,
          balance: 880,
          dueDate: dateOffsetYmd(3),
          lastActivityAt: todayAtOffsetMinutes(35),
          createdAt: daysAgoIso(12),
        },
        {
          name: 'Peter Kamau (Boda Stage)',
          phone: '+254 724 891 203',
          landmark: 'Makutano Boda Shed #4',
          totalBorrowed: 945,
          totalRepaid: 300,
          balance: 645,
          dueDate: dateOffsetYmd(-2), // Overdue!
          lastActivityAt: daysAgoIso(2, 18, 10),
          createdAt: daysAgoIso(18),
        },
        {
          name: 'Mwalimu Gitonga Murithi',
          phone: '+254 701 562 440',
          landmark: 'Milimani Primary Staff Quarters',
          totalBorrowed: 1620,
          totalRepaid: 600,
          balance: 1020,
          dueDate: dateOffsetYmd(5),
          lastActivityAt: todayAtOffsetMinutes(95),
          createdAt: daysAgoIso(20),
        },
        {
          name: 'Mercy Kawira (Glow Salon)',
          phone: '+254 798 114 725',
          landmark: 'Next to Equity Agent Stall',
          totalBorrowed: 520,
          totalRepaid: 520,
          balance: 0,
          dueDate: undefined,
          lastActivityAt: todayAtOffsetMinutes(150),
          createdAt: daysAgoIso(9),
        },
      ];

      const customerIds = (await db.customers.bulkAdd(customersSeed, {
        allKeys: true,
      })) as number[];

      const [mamaNjeriId, kamauId, gitongaId, kawiraId] = customerIds;

      // Historical + Today transactions
      const txs: CashFlowTransaction[] = [
        // Historical credit sale for Mama Njeri (3 days ago): 750
        {
          receiptNo: 'MF-3012',
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          items: [
            {
              inventoryId: itemIds[0],
              name: 'Jogoo Maize Meal 2kg',
              unit: 'pkt',
              quantity: 2,
              buyingPrice: 135,
              unitPrice: 160,
              subtotal: 320,
            },
            {
              inventoryId: itemIds[6],
              name: 'Mwea Pishori Rice Grade 1 (1kg)',
              unit: 'kg',
              quantity: 1,
              buyingPrice: 165,
              unitPrice: 210,
              subtotal: 210,
            },
            {
              inventoryId: itemIds[4],
              name: 'Kabras White Sugar 1kg',
              unit: 'kg',
              quantity: 1,
              buyingPrice: 140,
              unitPrice: 170,
              subtotal: 170,
            },
            {
              name: 'Kiberiti Matchbox Pack',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 35,
              unitPrice: 50,
              subtotal: 50,
            },
          ],
          totalAmount: 750,
          totalCost: 610,
          netProfit: 140,
          note: 'Monthly house shopping top-up',
          recordedBy: 'owner',
          createdAt: daysAgoIso(3, 17, 15),
        },
        // Historical overdue credit sale for Peter Kamau (4 days ago): 945, partial paid 300 2 days ago
        {
          receiptNo: 'MF-2984',
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: kamauId,
          customerName: 'Peter Kamau (Boda Stage)',
          items: [
            {
              inventoryId: itemIds[2],
              name: 'Fresh Fri Vegetable Oil 1L',
              unit: 'L',
              quantity: 1,
              buyingPrice: 265,
              unitPrice: 310,
              subtotal: 310,
            },
            {
              inventoryId: itemIds[1],
              name: 'Pembe All-Purpose Wheat 2kg',
              unit: 'pkt',
              quantity: 2,
              buyingPrice: 155,
              unitPrice: 185,
              subtotal: 370,
            },
            {
              inventoryId: itemIds[3],
              name: 'Brookside Tuzo Milk 500ml',
              unit: 'pkt',
              quantity: 3,
              buyingPrice: 52,
              unitPrice: 65,
              subtotal: 195,
            },
            {
              name: 'Royco Mchuzi Mix 100g',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 52,
              unitPrice: 70,
              subtotal: 70,
            },
          ],
          totalAmount: 945,
          totalCost: 783,
          netProfit: 162,
          note: 'Promised end-of-week boda settlement',
          recordedBy: 'staff',
          createdAt: daysAgoIso(4, 19, 5),
        },
        {
          receiptNo: 'MF-3099',
          kind: 'debt_repayment',
          paymentMethod: 'Cash',
          customerId: kamauId,
          customerName: 'Peter Kamau (Boda Stage)',
          items: [],
          totalAmount: 300,
          totalCost: 0,
          netProfit: 0,
          note: 'Evening stage cash installment',
          recordedBy: 'staff',
          createdAt: daysAgoIso(2, 18, 10),
        },
        // Historical credit sale for Mwalimu Gitonga (2 days ago): 1620
        {
          receiptNo: 'MF-3105',
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: gitongaId,
          customerName: 'Mwalimu Gitonga Murithi',
          items: [
            {
              inventoryId: itemIds[6],
              name: 'Mwea Pishori Rice Grade 1 (1kg)',
              unit: 'kg',
              quantity: 3,
              buyingPrice: 165,
              unitPrice: 210,
              subtotal: 630,
            },
            {
              inventoryId: itemIds[2],
              name: 'Fresh Fri Vegetable Oil 1L',
              unit: 'L',
              quantity: 2,
              buyingPrice: 265,
              unitPrice: 310,
              subtotal: 620,
            },
            {
              inventoryId: itemIds[4],
              name: 'Kabras White Sugar 1kg',
              unit: 'kg',
              quantity: 2,
              buyingPrice: 140,
              unitPrice: 170,
              subtotal: 340,
            },
            {
              name: 'Kensalt Iodized 500g',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 20,
              unitPrice: 30,
              subtotal: 30,
            },
          ],
          totalAmount: 1620,
          totalCost: 1325,
          netProfit: 295,
          note: 'End-month teacher account',
          recordedBy: 'owner',
          createdAt: daysAgoIso(2, 16, 40),
        },
        // Historical credit sale for Mercy Kawira (yesterday): 520 (repaid today!)
        {
          receiptNo: 'MF-3188',
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: kawiraId,
          customerName: 'Mercy Kawira (Glow Salon)',
          items: [
            {
              inventoryId: itemIds[8],
              name: 'Menengai Cream Laundry Bar 800g',
              unit: 'bar',
              quantity: 2,
              buyingPrice: 145,
              unitPrice: 180,
              subtotal: 360,
            },
            {
              inventoryId: itemIds[0],
              name: 'Jogoo Maize Meal 2kg',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 135,
              unitPrice: 160,
              subtotal: 160,
            },
          ],
          totalAmount: 520,
          totalCost: 425,
          netProfit: 95,
          note: 'Salon towels soap + unga',
          recordedBy: 'staff',
          createdAt: daysAgoIso(1, 13, 15),
        },

        // ================== TODAY'S LIVE TRANSACTIONS ==================
        // 1. Morning POS Cash Sale ( Breakfast rush )
        {
          receiptNo: 'MF-4102',
          kind: 'pos_sale',
          paymentMethod: 'Cash',
          items: [
            {
              inventoryId: itemIds[5],
              name: 'Supa Loaf White Bread 400g',
              unit: 'loaf',
              quantity: 4,
              buyingPrice: 55,
              unitPrice: 65,
              subtotal: 260,
            },
            {
              inventoryId: itemIds[3],
              name: 'Brookside Tuzo Milk 500ml',
              unit: 'pkt',
              quantity: 6,
              buyingPrice: 52,
              unitPrice: 65,
              subtotal: 390,
            },
            {
              inventoryId: itemIds[7],
              name: 'Ketepa Pride Tea Leaves 100g',
              unit: 'pkt',
              quantity: 2,
              buyingPrice: 58,
              unitPrice: 75,
              subtotal: 150,
            },
          ],
          totalAmount: 800,
          totalCost: 648,
          netProfit: 152,
          note: 'Morning breakfast walk-in bundle',
          recordedBy: 'staff',
          createdAt: todayAtOffsetMinutes(210),
        },
        // 2. Mercy Kawira full M-Pesa debt repayment today: 520
        {
          receiptNo: 'MF-4119',
          kind: 'debt_repayment',
          paymentMethod: 'M-Pesa',
          mpesaRef: 'SLH94K28MP',
          customerId: kawiraId,
          customerName: 'Mercy Kawira (Glow Salon)',
          items: [],
          totalAmount: 520,
          totalCost: 0,
          netProfit: 0,
          note: 'Cleared full salon balance via Till',
          recordedBy: 'staff',
          createdAt: todayAtOffsetMinutes(150),
        },
        // 3. Mid-morning M-Pesa POS Wholesale Basket
        {
          receiptNo: 'MF-4135',
          kind: 'pos_sale',
          paymentMethod: 'M-Pesa',
          mpesaRef: 'SLH97W51QA',
          items: [
            {
              inventoryId: itemIds[0],
              name: 'Jogoo Maize Meal 2kg',
              unit: 'pkt',
              quantity: 3,
              buyingPrice: 135,
              unitPrice: 160,
              subtotal: 480,
            },
            {
              inventoryId: itemIds[2],
              name: 'Fresh Fri Vegetable Oil 1L',
              unit: 'L',
              quantity: 2,
              buyingPrice: 265,
              unitPrice: 310,
              subtotal: 620,
            },
            {
              inventoryId: itemIds[6],
              name: 'Mwea Pishori Rice Grade 1 (1kg)',
              unit: 'kg',
              quantity: 2,
              buyingPrice: 165,
              unitPrice: 210,
              subtotal: 420,
            },
            {
              inventoryId: itemIds[4],
              name: 'Kabras White Sugar 1kg',
              unit: 'kg',
              quantity: 2,
              buyingPrice: 140,
              unitPrice: 170,
              subtotal: 340,
            },
          ],
          totalAmount: 1860,
          totalCost: 1545,
          netProfit: 315,
          note: 'Family pantry basket via M-Pesa Till',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(125),
        },
        // 4. Mwalimu Gitonga partial M-Pesa repayment today: 600
        {
          receiptNo: 'MF-4148',
          kind: 'debt_repayment',
          paymentMethod: 'M-Pesa',
          mpesaRef: 'SLH98M12TZ',
          customerId: gitongaId,
          customerName: 'Mwalimu Gitonga Murithi',
          items: [],
          totalAmount: 600,
          totalCost: 0,
          netProfit: 0,
          note: 'Partial M-Pesa installment',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(95),
        },
        // 5. Daily Stall Operating Expense (Packaging carrier bags): -80
        {
          receiptNo: 'MF-4156',
          kind: 'expense',
          paymentMethod: 'Cash',
          items: [],
          totalAmount: 80,
          totalCost: 80,
          netProfit: -80,
          note: 'Non-woven khaki packaging bags bundle',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(75),
        },
        // 6. Cash POS Sale (Lunch & airtime)
        {
          receiptNo: 'MF-4170',
          kind: 'pos_sale',
          paymentMethod: 'Cash',
          items: [
            {
              inventoryId: itemIds[1],
              name: 'Pembe All-Purpose Wheat 2kg',
              unit: 'pkt',
              quantity: 2,
              buyingPrice: 155,
              unitPrice: 185,
              subtotal: 370,
            },
            {
              inventoryId: itemIds[8],
              name: 'Menengai Cream Laundry Bar 800g',
              unit: 'bar',
              quantity: 2,
              buyingPrice: 145,
              unitPrice: 180,
              subtotal: 360,
            },
            {
              inventoryId: itemIds[9],
              name: 'Safaricom Scratch Airtime 100',
              unit: 'pcs',
              quantity: 3,
              buyingPrice: 95,
              unitPrice: 100,
              subtotal: 300,
            },
          ],
          totalAmount: 1030,
          totalCost: 885,
          netProfit: 145,
          note: 'Afternoon counter cash sales',
          recordedBy: 'staff',
          createdAt: todayAtOffsetMinutes(50),
        },
        // 7. Mama Njeri Today: Partial Cash repayment (500) + New Credit Items (630)
        {
          receiptNo: 'MF-4182',
          kind: 'debt_repayment',
          paymentMethod: 'Cash',
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          items: [],
          totalAmount: 500,
          totalCost: 0,
          netProfit: 0,
          note: 'Cash paid before taking evening items',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(40),
        },
        {
          receiptNo: 'MF-4189',
          kind: 'credit_sale',
          paymentMethod: 'Credit',
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          items: [
            {
              inventoryId: itemIds[2],
              name: 'Fresh Fri Vegetable Oil 1L',
              unit: 'L',
              quantity: 1,
              buyingPrice: 265,
              unitPrice: 310,
              subtotal: 310,
            },
            {
              inventoryId: itemIds[1],
              name: 'Pembe All-Purpose Wheat 2kg',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 155,
              unitPrice: 185,
              subtotal: 185,
            },
            {
              inventoryId: itemIds[3],
              name: 'Brookside Tuzo Milk 500ml',
              unit: 'pkt',
              quantity: 1,
              buyingPrice: 52,
              unitPrice: 65,
              subtotal: 65,
            },
            {
              name: 'Kunde Greens & Dhania Bundle',
              unit: 'pcs',
              quantity: 1,
              buyingPrice: 50,
              unitPrice: 70,
              subtotal: 70,
            },
          ],
          totalAmount: 630,
          totalCost: 522,
          netProfit: 108,
          note: 'Evening supper items sent with Njeri',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(35),
        },
      ];

      const txIds = (await db.transactions.bulkAdd(txs, { allKeys: true })) as number[];

      // Matching itemized CreditLedgerEntries
      const creditSeed: CreditLedgerEntry[] = [
        // Mama Njeri
        {
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          type: 'credit_sale',
          items: txs[0].items,
          amount: 750,
          estimatedProfit: 140,
          balanceAfter: 750,
          note: 'Monthly house shopping top-up',
          recordedBy: 'owner',
          saleTransactionId: txIds[0],
          createdAt: txs[0].createdAt,
        },
        {
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          type: 'repayment',
          items: [],
          amount: 500,
          estimatedProfit: 0,
          paymentMethod: 'Cash',
          balanceAfter: 250,
          note: 'Cash paid before taking evening items',
          recordedBy: 'owner',
          saleTransactionId: txIds[11],
          createdAt: txs[11].createdAt,
        },
        {
          customerId: mamaNjeriId,
          customerName: 'Mama Njeri Wanjiku',
          type: 'credit_sale',
          items: txs[12].items,
          amount: 630,
          estimatedProfit: 108,
          balanceAfter: 880,
          note: 'Evening supper items sent with Njeri',
          recordedBy: 'owner',
          saleTransactionId: txIds[12],
          createdAt: txs[12].createdAt,
        },

        // Peter Kamau
        {
          customerId: kamauId,
          customerName: 'Peter Kamau (Boda Stage)',
          type: 'credit_sale',
          items: txs[1].items,
          amount: 945,
          estimatedProfit: 162,
          balanceAfter: 945,
          note: 'Promised end-of-week boda settlement',
          recordedBy: 'staff',
          saleTransactionId: txIds[1],
          createdAt: txs[1].createdAt,
        },
        {
          customerId: kamauId,
          customerName: 'Peter Kamau (Boda Stage)',
          type: 'repayment',
          items: [],
          amount: 300,
          estimatedProfit: 0,
          paymentMethod: 'Cash',
          balanceAfter: 645,
          note: 'Evening stage cash installment',
          recordedBy: 'staff',
          saleTransactionId: txIds[2],
          createdAt: txs[2].createdAt,
        },

        // Mwalimu Gitonga
        {
          customerId: gitongaId,
          customerName: 'Mwalimu Gitonga Murithi',
          type: 'credit_sale',
          items: txs[3].items,
          amount: 1620,
          estimatedProfit: 295,
          balanceAfter: 1620,
          note: 'End-month teacher account',
          recordedBy: 'owner',
          saleTransactionId: txIds[3],
          createdAt: txs[3].createdAt,
        },
        {
          customerId: gitongaId,
          customerName: 'Mwalimu Gitonga Murithi',
          type: 'repayment',
          items: [],
          amount: 600,
          estimatedProfit: 0,
          paymentMethod: 'M-Pesa',
          mpesaRef: 'SLH98M12TZ',
          balanceAfter: 1020,
          note: 'Partial M-Pesa installment',
          recordedBy: 'owner',
          saleTransactionId: txIds[8],
          createdAt: txs[8].createdAt,
        },

        // Mercy Kawira
        {
          customerId: kawiraId,
          customerName: 'Mercy Kawira (Glow Salon)',
          type: 'credit_sale',
          items: txs[4].items,
          amount: 520,
          estimatedProfit: 95,
          balanceAfter: 520,
          note: 'Salon towels soap + unga',
          recordedBy: 'staff',
          saleTransactionId: txIds[4],
          createdAt: txs[4].createdAt,
        },
        {
          customerId: kawiraId,
          customerName: 'Mercy Kawira (Glow Salon)',
          type: 'repayment',
          items: [],
          amount: 520,
          estimatedProfit: 0,
          paymentMethod: 'M-Pesa',
          mpesaRef: 'SLH94K28MP',
          balanceAfter: 0,
          note: 'Cleared full salon balance via Till',
          recordedBy: 'staff',
          saleTransactionId: txIds[6],
          createdAt: txs[6].createdAt,
        },
      ];

      await db.creditEntries.bulkAdd(creditSeed);

      // Initial stock logs
      const stockSeed: StockMovementLog[] = [
        {
          inventoryId: itemIds[0],
          itemName: 'Jogoo Maize Meal 2kg',
          delta: 24,
          previousStock: 14,
          newStock: 38,
          reason: 'Wholesale Bale Restock (1x24)',
          recordedBy: 'staff',
          createdAt: todayAtOffsetMinutes(240),
        },
        {
          inventoryId: itemIds[2],
          itemName: 'Fresh Fri Vegetable Oil 1L',
          delta: -1,
          previousStock: 5,
          newStock: 4,
          reason: 'Credit Sale (MF-4189)',
          recordedBy: 'owner',
          createdAt: todayAtOffsetMinutes(35),
        },
      ];
      await db.stockLogs.bulkAdd(stockSeed);
    }
  );
}
