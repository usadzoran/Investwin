import { supabase } from "@/lib/supabase";
import type { ChainKey } from "@/lib/wallet";

export type DepositStatus = "pending" | "completed" | "failed";
export type DepositRecord = { id: string; hash: string; chain: ChainKey; status: DepositStatus; createdAt: string };

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("يجب تسجيل الدخول قبل استخدام المحفظة.");
  return data.user;
}

export async function syncUserWallet(userId: string, email: string | undefined, walletAddress: string, chain: ChainKey) {
  const { error } = await supabase.from("user_profiles").upsert({ user_id: userId, email: email ?? null, wallet_address: walletAddress.toLowerCase(), chain_key: chain, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadUserDeposits(userId: string): Promise<DepositRecord[]> {
  const { data, error } = await supabase.from("deposit_records").select("id,tx_hash,chain_key,status,created_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, hash: row.tx_hash, chain: row.chain_key as ChainKey, status: row.status as DepositStatus, createdAt: row.created_at }));
}

export async function createUserDeposit(input: { userId: string; walletAddress: string; chain: ChainKey; hash: string; status: DepositStatus }) {
  const { data, error } = await supabase.from("deposit_records").insert({ user_id: input.userId, wallet_address: input.walletAddress.toLowerCase(), chain_key: input.chain, tx_hash: input.hash, status: input.status }).select("id,tx_hash,chain_key,status,created_at").single();
  if (error) throw error;
  return { id: data.id, hash: data.tx_hash, chain: data.chain_key as ChainKey, status: data.status as DepositStatus, createdAt: data.created_at };
}

export async function updateUserDeposit(id: string, status: DepositStatus) {
  const { error } = await supabase.from("deposit_records").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function recordUserTransfer(input: { userId: string; fromAddress: string; toAddress: string; chain: ChainKey; amount: string; txHash: string }) {
  const { error } = await supabase.from("wallet_transfers").insert({ user_id: input.userId, from_address: input.fromAddress.toLowerCase(), recipient_address: input.toAddress.toLowerCase(), chain_key: input.chain, amount: Number(input.amount), tx_hash: input.txHash, status: "confirmed" });
  if (error) throw error;
}

export interface InvestmentPlan {
  id: string;
  userId: string;
  walletAddress: string;
  amount: number; // e.g. 5, 10, 50
  dailyProfit: number; // e.g. 1 for 5, 2 for 10 (20% daily)
  durationDays: number; // e.g. 7 days (1 week or more)
  startedAt: string; // ISO string
  lastClaimAt: string; // ISO string
  claimedProfits: number;
  status: "active" | "completed" | "withdrawn";
}

const STORAGE_KEY_PREFIX = "noura_investments_";

export function loadUserInvestments(userId: string): InvestmentPlan[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as InvestmentPlan[];
  } catch {
    return [];
  }
}

export function saveUserInvestments(userId: string, plans: InvestmentPlan[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(plans));
  } catch (e) {
    console.error("Failed to save investments", e);
  }
}

export function createInvestmentPlan(input: {
  userId: string;
  walletAddress: string;
  amount: number;
  durationDays: number;
}): InvestmentPlan {
  const existing = loadUserInvestments(input.userId);
  const now = new Date().toISOString();
  
  // Daily profit is 20% of investment: 5$ -> 1$, 10$ -> 2$
  const dailyProfit = +(input.amount * 0.20).toFixed(2);

  const newPlan: InvestmentPlan = {
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: input.userId,
    walletAddress: input.walletAddress,
    amount: input.amount,
    dailyProfit,
    durationDays: Math.max(7, input.durationDays), // minimum 1 week (7 days)
    startedAt: now,
    lastClaimAt: now,
    claimedProfits: 0,
    status: "active",
  };

  const updated = [newPlan, ...existing];
  saveUserInvestments(input.userId, updated);
  return newPlan;
}

export function getPlanEarningsInfo(plan: InvestmentPlan) {
  const started = new Date(plan.startedAt).getTime();
  const lastClaim = new Date(plan.lastClaimAt).getTime();
  const now = Date.now();
  
  const msInDay = 24 * 60 * 60 * 1000;
  const totalDaysPassed = Math.floor((now - started) / msInDay);
  const daysSinceLastClaim = Math.floor((now - lastClaim) / msInDay);

  // Remaining ms until next 24h payout cycle
  const msSinceLastCycle = (now - started) % msInDay;
  const msUntilNextCycle = msInDay - msSinceLastCycle;

  // Max days capped by duration
  const daysEligible = Math.min(plan.durationDays, totalDaysPassed);
  const maxTotalProfit = +(plan.dailyProfit * plan.durationDays).toFixed(2);

  // Available claimable profits based on full 24h cycles passed
  const availableCycles = Math.min(daysSinceLastClaim, plan.durationDays);
  const claimableProfit = availableCycles > 0 ? +(availableCycles * plan.dailyProfit).toFixed(2) : 0;

  const isCompleted = totalDaysPassed >= plan.durationDays;

  return {
    totalDaysPassed,
    daysSinceLastClaim,
    msUntilNextCycle,
    claimableProfit,
    maxTotalProfit,
    isCompleted,
  };
}

export function claimInvestmentProfits(userId: string, planId: string): { claimed: number; plan: InvestmentPlan } {
  const plans = loadUserInvestments(userId);
  const index = plans.findIndex((p) => p.id === planId);
  if (index === -1) throw new Error("الخطة غير موجودة.");

  const plan = plans[index];
  const { claimableProfit, isCompleted } = getPlanEarningsInfo(plan);

  if (claimableProfit <= 0) {
    throw new Error("لم تنتهِ دورة الـ 24 ساعة الحالية بعد للحصول على أرباح جديدة.");
  }

  const updatedPlan: InvestmentPlan = {
    ...plan,
    claimedProfits: +(plan.claimedProfits + claimableProfit).toFixed(2),
    lastClaimAt: new Date().toISOString(),
    status: isCompleted ? "completed" : "active",
  };

  plans[index] = updatedPlan;
  saveUserInvestments(userId, plans);

  return { claimed: claimableProfit, plan: updatedPlan };
}

export function withdrawPlanPrincipal(userId: string, planId: string): InvestmentPlan {
  const plans = loadUserInvestments(userId);
  const index = plans.findIndex((p) => p.id === planId);
  if (index === -1) throw new Error("الخطة غير موجودة.");

  const plan = plans[index];
  const updatedPlan: InvestmentPlan = {
    ...plan,
    status: "withdrawn",
  };

  plans[index] = updatedPlan;
  saveUserInvestments(userId, plans);

  return updatedPlan;
}
