export function minutesAgo(mins: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - mins * 60_000);
}

export function hoursAgo(h: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - h * 3600_000);
}

export function daysAgo(d: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - d * 86400_000);
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const ta = typeof a === "string" ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === "string" ? new Date(b).getTime() : b.getTime();
  return Math.max(0, (tb - ta) / 86400_000);
}
