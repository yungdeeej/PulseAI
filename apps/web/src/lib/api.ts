const BASE = "";

export interface TokenState {
  price_usd: number | null;
  market_cap_usd: number | null;
  holder_count: number | null;
  current_tier: string | null;
  volume_24h_usd: number | null;
  mint_address: string | null;
}

export interface Vault {
  kind: string;
  balance_sol: number;
  balance_pulse: number;
  address: string | null;
}

export interface DashboardData {
  tokenState: TokenState | null;
  vaults: Vault[];
  priceHistory: number[];
  change24h: number;
}

export interface ActivityEvent {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${BASE}/api/dashboard`);
  if (!res.ok) throw new Error(`dashboard fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchActivity(limit = 30): Promise<ActivityEvent[]> {
  const res = await fetch(`${BASE}/api/activity?limit=${limit}`);
  if (!res.ok) throw new Error(`activity fetch failed: ${res.status}`);
  const data = await res.json();
  return data.activity ?? [];
}
