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

export interface MarketActivity {
  buys_5m: number;
  sells_5m: number;
  buys_1h: number;
  sells_1h: number;
  price_change_5m: number;
  price_change_1h: number;
}

export interface AIInsight {
  id: number;
  created_at: string;
  headline: string;
  commentary: string;
  mood: string;
  vote_lean: string | null;
  vote_reason: string | null;
  confidence: number;
}

export interface DashboardData {
  tokenState: TokenState | null;
  vaults: Vault[];
  priceHistory: number[];
  change24h: number;
  creator_wallet_sol: number | null;
  market_activity: MarketActivity | null;
  ai_insight: AIInsight | null;
}

export interface AIMemory {
  id: number;
  created_at: string;
  kind: string;
  memory: string;
  weight: number;
}

export async function fetchConsciousness(limit = 8): Promise<{
  latest: AIInsight | null;
  recent: AIInsight[];
  memories: AIMemory[];
}> {
  const res = await fetch(`${BASE}/api/consciousness?limit=${limit}`);
  if (!res.ok) throw new Error(`consciousness fetch failed: ${res.status}`);
  return res.json();
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

export interface VoteDebate {
  cases: { option: string; argument: string }[];
  lean: string | null;
  lean_reason: string | null;
}

export interface ActiveVote {
  id: string;
  tier_id: string;
  options: string[];
  decision_pool_sol: number;
  opens_at: string;
  closes_at: string;
  status: "open" | "closed" | "executed";
  winning_option: string | null;
  debate: VoteDebate | null;
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

export async function submitTweetUrl(
  wallet: string,
  url: string,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const res = await fetch(`${BASE}/tweets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, url }),
  });
  return res.json();
}

// ─── My Pulse: profile + leaderboard ─────────────────────────────────────────

export interface ConvictionProfile {
  wallet: string;
  balance: number;
  hold_days: number;
  hold_multiplier: number;
  status_flags: string[];
  status_bonus: number;
  streak_days: number;
  reinforcement_count: number;
  reinforcement_bonus: number;
  tweet_multiplier_active: boolean;
  weight: number;
}

export interface ProjectedShare {
  pool_sol: number;
  share_pct: number;
  projected_sol: number;
}

export async function fetchProfile(wallet: string): Promise<{
  profile: ConvictionProfile;
  projected_split_rewards: ProjectedShare;
} | null> {
  const res = await fetch(`${BASE}/api/wallets/${encodeURIComponent(wallet)}/profile`);
  if (!res.ok) return null;
  return res.json();
}

export interface LeaderboardEntry {
  wallet: string;
  weight: number;
  streak_days: number;
  hold_days: number;
  status_flags: string[];
}

export async function fetchLeaderboard(): Promise<{
  conviction: LeaderboardEntry[];
  streaks: { wallet: string; current_days: number }[];
}> {
  const res = await fetch(`${BASE}/api/leaderboard`);
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
  return res.json();
}

// ─── Talk to PULSE ────────────────────────────────────────────────────────────

export interface ChatQuota {
  tier: string;
  limit: number;
  used: number;
  remaining: number;
  balance: number;
}

export async function fetchChatQuota(token: string | null): Promise<{
  quota: ChatQuota;
  configured: boolean;
  signed_in: boolean;
} | null> {
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`${BASE}/api/chat/quota${qs}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createChatSession(args: {
  wallet: string;
  ts: string;
  signature: string;
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  const res = await fetch(`${BASE}/api/chat/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return res.json();
}

/**
 * Stream a chat message. The endpoint replies with SSE frames over a POST
 * body, so we parse the ReadableStream manually (EventSource is GET-only).
 */
export async function streamChat(args: {
  message: string;
  token: string | null;
  onDelta: (text: string) => void;
}): Promise<{ ok: boolean; error?: string; quota?: ChatQuota }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: args.message, token: args.token ?? undefined }),
  });
  if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? `request failed (${res.status})` };
  }
  if (!res.body) return { ok: false, error: "no response body" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { ok: boolean; error?: string; quota?: ChatQuota } = { ok: true };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "delta" && typeof parsed.text === "string") args.onDelta(parsed.text);
        else if (event === "done") result = { ok: true, quota: parsed.quota };
        else if (event === "error") result = { ok: false, error: parsed.error, quota: parsed.quota ?? undefined };
      } catch { /* skip malformed frame */ }
    }
  }
  return result;
}
