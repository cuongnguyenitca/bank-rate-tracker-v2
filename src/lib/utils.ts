export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2).replace('.', ',');
}

export function formatRateRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min === null && max === null) return '-';
  if (min === null || min === undefined) return formatRate(max);
  if (max === null || max === undefined) return formatRate(min);
  if (min === max) return formatRate(min);
  return `${formatRate(min)} - ${formatRate(max)}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function todayISO(): string {
  return formatDateISO(new Date());
}

export function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
