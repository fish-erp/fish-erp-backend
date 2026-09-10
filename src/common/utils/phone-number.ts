export function normalizeVietnamPhoneNumber(value: string): string | null {
  const compact = value.trim().replace(/[\s.()-]/g, '');
  if (/^\+84\d{9}$/.test(compact)) return compact;
  if (/^84\d{9}$/.test(compact)) return `+${compact}`;
  if (/^0\d{9}$/.test(compact)) return `+84${compact.slice(1)}`;
  return null;
}
