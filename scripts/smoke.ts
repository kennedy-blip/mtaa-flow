import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://mtaaflow.test/',
    pretendToBeVisual: true,
  });

  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.SVGElement = dom.window.SVGElement;
  g.HTMLDivElement = dom.window.HTMLDivElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.MutationObserver = dom.window.MutationObserver;
  g.AbortController = dom.window.AbortController;
  g.AbortSignal = dom.window.AbortSignal;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.CustomEvent = dom.window.CustomEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.getComputedStyle = dom.window.getComputedStyle;
  g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id: any) => clearTimeout(id);
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  dom.window.matchMedia = g.matchMedia as any;
  g.indexedDB = (globalThis as any).indexedDB;
  g.IS_REACT_ACT_ENVIRONMENT = false;

  const errors: string[] = [];
  const origError = console.error;
  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(' '));
    origError(...args);
  };

  await build({
    root,
    logLevel: 'error',
    build: {
      ssr: path.join(root, 'scripts/smoke-entry.tsx'),
      outDir: 'scripts/dist-smoke',
      emptyOutDir: true,
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client'] },
    },
  });

  const mod = await import(path.join(root, 'scripts/dist-smoke/smoke-entry.js'));
  void mod;
  await new Promise((r) => setTimeout(r, 2500));

  const html = dom.window.document.body.innerHTML;
  console.log('RENDERED_LENGTH', html.length);
  console.log('HAS_HEADER', html.includes('MtaaFlow'));
  console.log('HAS_DASHBOARD', html.includes('Daily Cash') || html.includes('Total Sales'));
  const readText = () => (dom.window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
  const clickByText = async (needle: string, index = 0) => {
    const candidates = Array.from(dom.window.document.querySelectorAll('button,a')) as HTMLElement[];
    const hits = candidates.filter((el) => (el.textContent || '').includes(needle));
    const target = hits[index];
    if (!target) throw new Error(`No clickable element containing "${needle}"`);
    target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 900));
  };

  console.log('DASH_NET_PROFIT', /Net Estimated Profit/.test(readText()));

  await clickByText('Credit Ledger');
  const ledgerText = readText();
  console.log('LEDGER_OK', ledgerText.includes('DeniTracker'), ledgerText.includes('Repay'));

  await clickByText('Inventory');
  const invText = readText();
  console.log('INVENTORY_OK', invText.includes('Smart Inventory'), invText.includes('LOW STOCK'));

  await clickByText('Settings');
  const setText = readText();
  console.log('SETTINGS_OK', setText.includes('Settings, Privileges'), setText.includes('Download Android APK'));

  await clickByText('Daily Recon');
  await clickByText('Record Sale');
  console.log('QUICKSALE_OK', readText().includes('Quick POS & Credit Checkout'));

  // End-to-end: add a catalogue product to the basket, then complete a cash sale
  const productName = 'Mwea Pishori Rice Grade 1 (1kg)';
  await clickByText(productName);
  console.log('CART_HAS_ITEM', readText().includes('Itemized Basket (1 units)'));

  const saleButton = Array.from(dom.window.document.querySelectorAll('button')).find((b) =>
    (b.textContent || '').includes('Complete Cash Sale')
  );
  if (!saleButton) throw new Error('Cash checkout button missing');
  saleButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 1200));

  const doneText = readText();
  console.log('SALE_RECORDED', doneText.includes('Transaction Recorded'));
  const receiptMatch = doneText.match(/Transaction Recorded • (MF-\d+)/);
  const newReceiptNo = receiptMatch ? receiptMatch[1] : '';
  console.log('RECEIPT_NUMBER_ISSUED', Boolean(newReceiptNo), newReceiptNo);

  await clickByText('Done');
  console.log('RECEIPT_IN_CASHFLOW_FEED', readText().includes(newReceiptNo), newReceiptNo);

  // Repayment modal from the ledger
  await clickByText('Credit Ledger');
  await clickByText('Repay');
  console.log('REPAY_MODAL_OK', readText().includes('Record Debt Repayment'));
  await clickByText('Cancel');

  // Theme engine persists to <html data-theme>
  await clickByText('Amber', 0);
  console.log(
    'THEME_AMBER_APPLIED',
    dom.window.document.documentElement.getAttribute('data-theme') === 'amber',
    dom.window.document.documentElement.getAttribute('data-theme')
  );

  // Attendant privilege shield hides net profit
  await clickByText('Staff', 0);
  await clickByText('Daily Recon');
  const staffText = readText();
  console.log(
    'STAFF_PROFIT_SHIELD',
    staffText.includes('Owner Privilege Required') && !staffText.includes('Net Margin')
  );
  await clickByText('Owner', 0);
  const ownerText = readText();
  console.log('OWNER_PROFIT_RESTORED', ownerText.includes('Net Margin'));
  console.log('ERRORS', errors.length);
  for (const e of errors.slice(0, 8)) console.log('ERR:', e.slice(0, 400));
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE_FAILED', e);
  process.exit(1);
});
