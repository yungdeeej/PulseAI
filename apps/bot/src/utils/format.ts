export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatSol(n: number): string {
  return `${n.toFixed(3)} SOL`;
}

export function formatPulse(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} $PULSE`;
}

export function shortAddress(a: string): string {
  if (a.length <= 10) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
