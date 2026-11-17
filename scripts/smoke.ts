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
  console.log('TEXT_DASH', readText().slice(0, 220));

  await clickByText('Credit Ledger');
  const ledgerText = readText();
  console.log('LEDGER_OK', ledgerText.includes('DeniTracker'), ledgerText.includes('Repay'));
  console.log('LEDGER_TEXT', ledgerText.slice(0, 700));

  await clickByText('Inventory');
  const invText = readText();
  console.log('INVENTORY_OK', invText.includes('Smart Inventory'), invText.includes('LOW STOCK'));

  await clickByText('Settings');
  const setText = readText();
  console.log('SETTINGS_OK', setText.includes('Settings, Privileges'), setText.includes('Download Android APK'));
  console.log('SETTINGS_TEXT', setText.slice(0, 500));

  await clickByText('Daily Recon');
  await clickByText('Record Sale');
  const saleText = readText();
  console.log('QUICKSALE_OK', saleText.includes('Cash') && (saleText.includes('M-Pesa') || saleText.includes('Checkout') || saleText.includes('Cart')));
  console.log('ERRORS', errors.length);
  for (const e of errors.slice(0, 8)) console.log('ERR:', e.slice(0, 400));
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE_FAILED', e);
  process.exit(1);
});
