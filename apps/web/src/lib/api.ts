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
  creator_wallet_sol: number | null;
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

// ─── Voting ───────────────────────────────────────────────────────────────────

export interface ActiveVote {
  id: string;
  tier_id: string;
  options: string[];
  decision_pool_sol: number;
  opens_at: string;
  closes_at: string;
  status: "open" | "closed" | "executed";
  winning_option: string | null;
  target_mint: string | null;
}

export interface TallyItem {
  total_weight: number;
  count: number;
}

export type VoteTally = Record<string, TallyItem>;

export interface VoteResponse {
  vote: ActiveVote | null;
  tally: VoteTally;
}

export async function fetchActiveVote(): Promise<VoteResponse> {
  const res = await fetch(`${BASE}/votes/active`);
  if (!res.ok) throw new Error(`votes fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchConviction(wallet: string): Promise<number> {
  const res = await fetch(`${BASE}/wallets/${encodeURIComponent(wallet)}/conviction`);
  if (!res.ok) return 0;
  const data = await res.json();
  return Number(data.weight ?? 0);
}

export interface SubmitVotePayload {
  wallet: string;
  voteId: string;
  option: string;
  ts: string;
  signature: string;
}

export async function submitVote(
  payload: SubmitVotePayload,
): Promise<{ ok: boolean; weight?: number; error?: string }> {
  const res = await fetch(`${BASE}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
