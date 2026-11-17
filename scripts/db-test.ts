import 'fake-indexeddb/auto';
import {
  db,
  recordSaleTransaction,
  recordCustomerRepayment,
  recordShopExpense,
  addIncomingStock,
  voidTransactionAsOwner,
  exportFullLedgerBackup,
  importFullLedgerBackup,
} from '../src/db/db';
import { resetWithRealisticDemoData } from '../src/db/seed';

const assert = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} :: ${label}`, cond ? '' : JSON.stringify(extra));
  if (!cond) process.exitCode = 1;
};

async function main() {
  await resetWithRealisticDemoData(false);

  const inv = await db.inventory.toArray();
  const flour = inv.find((i) => i.name.toLowerCase().includes('flour')) ?? inv[0];
  const beforeStock = flour.stock;
  const beforeTx = await db.transactions.count();

  // 1. Cash sale deducts stock + logs receipt with correct margin
  const cashSale = await recordSaleTransaction({
    items: [
      {
        inventoryId: flour.id,
        name: flour.name,
        unit: flour.unit,
        quantity: 2,
        buyingPrice: flour.buyingPrice,
        unitPrice: flour.sellingPrice,
        subtotal: flour.sellingPrice * 2,
      },
    ],
    paymentMethod: 'Cash',
    recordedBy: 'staff',
  });
  const flourAfter = await db.inventory.get(flour.id!);
  assert('cash sale reduces stock by 2', flourAfter?.stock === beforeStock - 2, {
    beforeStock,
    after: flourAfter?.stock,
  });
  assert('cash sale logs transaction', (await db.transactions.count()) === beforeTx + 1);

  const cashTx = await db.transactions.get(cashSale.transactionId);
  assert(
    'cash sale margin = (sell - buy) * qty',
    cashTx?.netProfit === (flour.sellingPrice - flour.buyingPrice) * 2,
    cashTx?.netProfit
  );

  // 2. Credit sale creates customer + ledger entry and raises balance
  const creditSale = await recordSaleTransaction({
    items: [
      {
        inventoryId: flour.id,
        name: flour.name,
        unit: flour.unit,
        quantity: 1,
        buyingPrice: flour.buyingPrice,
        unitPrice: flour.sellingPrice,
        subtotal: flour.sellingPrice,
      },
    ],
    paymentMethod: 'Credit',
    recordedBy: 'staff',
    newCustomer: { name: 'Test Mama Wanjiru', phone: '+254700111222', landmark: 'Test Stall' },
  });
  const tx = await db.transactions.get(creditSale.transactionId);
  const customerId = tx?.customerId!;
  const cust = await db.customers.get(customerId);
  assert('credit sale creates customer with balance', cust?.balance === flour.sellingPrice, cust);

  // 3. Partial repayment reduces balance and never exceeds it
  const repay = await recordCustomerRepayment({
    customerId,
    amount: Math.round(flour.sellingPrice / 2),
    paymentMethod: 'M-Pesa',
    mpesaRef: 'SLK1234567',
    recordedBy: 'staff',
  });
  assert(
    'partial repayment halves balance',
    repay.newBalance === flour.sellingPrice - Math.round(flour.sellingPrice / 2),
    repay.newBalance
  );
  const repayTx = await db.transactions.where('kind').equals('debt_repayment').last();
  assert('repayment carries zero profit (no double count)', repayTx?.netProfit === 0);

  // 4. Expense reduces net profit only through expense kind
  const expensesBefore = await db.transactions.where('kind').equals('expense').count();
  await recordShopExpense({
    description: 'Test boda delivery',
    amount: 120,
    paymentMethod: 'Cash',
    recordedBy: 'owner',
  });
  assert(
    'expense appended',
    (await db.transactions.where('kind').equals('expense').count()) === expensesBefore + 1
  );

  // 5. Restock increases stock + logs movement
  const stockBefore = (await db.inventory.get(flour.id!))!.stock;
  await addIncomingStock({
    inventoryId: flour.id!,
    addedQuantity: 5,
    reason: 'Test supplier',
    recordedBy: 'staff',
  });
  const restocked = await db.inventory.get(flour.id!);
  assert('restock adds quantity', restocked?.stock === stockBefore + 5, {
    stockBefore,
    after: restocked?.stock,
  });

  // 6. Owner void restores stock and removes receipt + linked ledger entry
  const stockPreVoid = restocked!.stock;
  await voidTransactionAsOwner(cashSale.transactionId);
  const stockPostVoid = (await db.inventory.get(flour.id!))!.stock;
  assert('void restores sold stock', stockPostVoid === stockPreVoid + 2, {
    stockPreVoid,
    stockPostVoid,
  });
  assert('void removes transaction row', (await db.transactions.get(cashSale.transactionId)) === undefined);

  // 7. Credit void reverses customer balance + ledger entry
  const balanceBeforeVoid = (await db.customers.get(customerId))!.balance;
  await voidTransactionAsOwner(creditSale.transactionId);
  const afterCreditVoid = await db.customers.get(customerId);
  assert(
    'void of credit sale reverses balance (clamped at zero)',
    afterCreditVoid!.balance === Math.max(0, balanceBeforeVoid - flour.sellingPrice),
    { balanceBeforeVoid, now: afterCreditVoid!.balance }
  );
  assert(
    'void of credit sale reverses totalBorrowed',
    afterCreditVoid!.totalBorrowed === 0,
    afterCreditVoid!.totalBorrowed
  );
  const orphanEntries = await db.creditEntries
    .where('saleTransactionId')
    .equals(creditSale.transactionId)
    .count();
  assert('void removes linked credit ledger entry', orphanEntries === 0, orphanEntries);

  // 8. Backup round-trip
  const backup = await exportFullLedgerBackup();
  const txCount = await db.transactions.count();
  await db.transactions.clear();
  await importFullLedgerBackup(backup);
  assert('backup restore returns all transactions', (await db.transactions.count()) === txCount, {
    txCount,
    restored: await db.transactions.count(),
  });

  console.log('DB_TESTS_DONE');
  await db.delete();
}

main().catch((e) => {
  console.error('DB_TEST_ERROR', e);
  process.exit(1);
});
