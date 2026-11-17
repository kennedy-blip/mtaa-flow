export function formatCurrency(amount: number, currency = 'KSh'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(safe);
  const absFormatted = Math.abs(rounded).toLocaleString('en-KE');
  if (rounded < 0) {
    return `-${currency} ${absFormatted}`;
  }
  return `${currency} ${absFormatted}`;
}

export function formatRelativeOrShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  if (isSameDay) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return 'No due date';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function isPastDue(dueDate?: string, balance = 0): boolean {
  if (!dueDate || balance <= 0) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return dueDate < todayStr;
}

export function generateReceiptNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const stamp = Date.now().toString().slice(-3);
  return `MF-${stamp}${rand}`.slice(0, 8);
}

export function sanitizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('07') || digits.startsWith('01')) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith('+254')) {
    return digits.slice(1);
  }
  return digits;
}
