/** Every numeric field arrives as a string; empties come as null, "" or "null". */
export function toStr(v: unknown): string | null {
  // Only primitives are meaningful here. An object in one of these fields is
  // malformed data, and String({}) would silently yield "[object Object]".
  if (
    typeof v !== 'string' &&
    typeof v !== 'number' &&
    typeof v !== 'boolean'
  ) {
    return null;
  }
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'null' ? null : s;
}

export function toInt(v: unknown): number | null {
  const s = toStr(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** strHome is "Yes" / "No". */
export function toBool(v: unknown): boolean {
  return toStr(v)?.toLowerCase() === 'yes';
}

/**
 * strTimestamp is UTC but has no timezone suffix ("2025-08-22T18:30:00").
 * new Date() would read that as LOCAL time — a 2-hour error in Skopje.
 * We append 'Z' unless an offset is already present.
 */
export function toInstant(v: unknown): string | null {
  const s = toStr(v);
  if (s === null) return null;
  const t = s.replace(' ', 'T');
  const hasZone = t.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(t);
  const d = new Date(hasZone ? t : `${t}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** intTime is "45", occasionally "90+2". */
export function parseMinute(
  v: unknown,
): { minute: number; stoppage: number | null } | null {
  const s = toStr(v);
  if (s === null) return null;
  const m = s.match(/^(\d+)(?:\s*\+\s*(\d+))?/);
  return m
    ? { minute: Number(m[1]), stoppage: m[2] ? Number(m[2]) : null }
    : null;
}
