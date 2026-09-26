import { supabase } from "@/lib/supabase";
import type { ChainKey } from "@/lib/wallet";

export type DepositStatus = "pending" | "completed" | "failed";
export type DepositRecord = { id: string; hash: string; chain: ChainKey; status: DepositStatus; amount?: number; createdAt: string; walletAddress?: string; userId?: string };

export type AdminUser = { user_id: string; email: string | null; wallet_address: string | null; chain_key: ChainKey | null; created_at?: string };
export type AdminTransferRecord = { id: string; recipient_address: string; chain_key: ChainKey; amount: number; status: string; tx_hash: string | null; created_at: string; admin_user_id?: string; recipient_user_id?: string | null };

// Global persistent storage keys for seamless database fallback & real data persistence
const STORAGE_PREFIX = "noura_db_";
const USERS_STORAGE_KEY = `${STORAGE_PREFIX}users`;
const DEPOSITS_STORAGE_KEY = `${STORAGE_PREFIX}deposits`;
const TRANSFERS_STORAGE_KEY = `${STORAGE_PREFIX}transfers`;
const INVESTMENTS_STORAGE_KEY = `${STORAGE_PREFIX}investments`;

function safeJsonParse<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function safeJsonSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to persist ${key}`, err);
  }
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("يجب تسجيل الدخول قبل استخدام المحفظة.");
  }
  return data.user;
}

export async function syncUserWallet(userId: string, email: string | undefined, walletAddress: string, chain: ChainKey) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("user_profiles").upsert(
    { user_id: userId, email: email ?? null, wallet_address: walletAddress.toLowerCase(), chain_key: chain, updated_at: now },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`تعذر حفظ المحفظة في قاعدة البيانات: ${error.message}`);
}

export async function loadUserDeposits(userId: string): Promise<DepositRecord[]> {
  // 1. Try fetching from Supabase
  try {
    const { data, error } = await supabase
      .from("deposit_records")
      .select("id,tx_hash,chain_key,status,created_at,amount,wallet_address")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) => ({
        id: row.id,
        hash: row.tx_hash,
        chain: row.chain_key as ChainKey,
        status: row.status as DepositStatus,
        amount: row.amount ?? undefined,
        createdAt: row.created_at,
        walletAddress: row.wallet_address,
        userId,
      }));
  } catch (error) {
    console.error("Supabase deposit_records fetch failed:", error);
    return [];
  }
}

export async function createUserDeposit(input: {
  userId: string;
  walletAddress: string;
  chain: ChainKey;
  hash: string;
  status: DepositStatus;
  amount?: number;
}) {
  const now = new Date().toISOString();
  const recordId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const newDeposit: DepositRecord = {
    id: recordId,
    hash: input.hash,
    chain: input.chain,
    status: input.status,
    amount: input.amount,
    createdAt: now,
    walletAddress: input.walletAddress.toLowerCase(),
    userId: input.userId,
  };

  const { data, error } = await supabase
      .from("deposit_records")
      .insert({
        user_id: input.userId,
        wallet_address: input.walletAddress.toLowerCase(),
        chain_key: input.chain,
        tx_hash: input.hash,
        status: input.status,
        amount: input.amount ?? null,
      })
      .select("id,tx_hash,chain_key,status,created_at")
      .single();
  if (error) throw new Error(`تعذر حفظ الإيداع في قاعدة البيانات: ${error.message}`);
  if (data?.id) newDeposit.id = data.id;

  return newDeposit;
}

export async function updateUserDeposit(id: string, status: DepositStatus) {
  const { error } = await supabase.from("deposit_records").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`تعذر تحديث الإيداع في قاعدة البيانات: ${error.message}`);
}

export async function recordUserTransfer(input: {
  userId: string;
  fromAddress: string;
  toAddress: string;
  chain: ChainKey;
  amount: string;
  txHash: string;
}) {
  const now = new Date().toISOString();
  const recordId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const transferRecord: AdminTransferRecord = {
    id: recordId,
    recipient_address: input.toAddress.toLowerCase(),
    chain_key: input.chain,
    amount: Number(input.amount),
    status: "confirmed",
    tx_hash: input.txHash,
    created_at: now,
    recipient_user_id: input.userId,
  };

  const { error } = await supabase.from("wallet_transfers").insert({
      user_id: input.userId,
      from_address: input.fromAddress.toLowerCase(),
      recipient_address: input.toAddress.toLowerCase(),
      chain_key: input.chain,
      amount: Number(input.amount),
      tx_hash: input.txHash,
      status: "confirmed",
    });
  if (error) throw new Error(`تعذر حفظ التحويل في قاعدة البيانات: ${error.message}`);
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
    if (raw) return JSON.parse(raw) as InvestmentPlan[];
    
    // Check all investments registry
    const all = safeJsonParse<InvestmentPlan[]>(INVESTMENTS_STORAGE_KEY, []);
    return all.filter((p) => p.userId === userId);
  } catch {
    return [];
  }
}

export function saveUserInvestments(userId: string, plans: InvestmentPlan[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(plans));

    // Update in global registry as well
    const all = safeJsonParse<InvestmentPlan[]>(INVESTMENTS_STORAGE_KEY, []);
    const otherUsersPlans = all.filter((p) => p.userId !== userId);
    safeJsonSet(INVESTMENTS_STORAGE_KEY, [...plans, ...otherUsersPlans]);
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

// =========================================================================
// ADMIN DATA ACCESS & DATABASE HEALTH VERIFICATION
// =========================================================================

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  url: string;
  latencyMs: number;
  statusText: string;
}> {
  const startTime = Date.now();
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://vmhhriytxjeikorzoqcs.supabase.co";
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaGhyaXl0eGplaWtvcnpvcWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTYzMzUsImV4cCI6MjEwNTk5MjMzNX0.HxSSo5S89bpTM7cbRSCcqnTxXR1c73xVyGZtAFHJBCU";

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const latencyMs = Date.now() - startTime;
    return {
      connected: res.ok,
      url,
      latencyMs,
      statusText: res.ok ? "متصل بنشاط وجاهز (Active & Healthy)" : "استجابة غير مكتملة",
    };
  } catch (err) {
    return {
      connected: false,
      url,
      latencyMs: Date.now() - startTime,
      statusText: "تعذر الاتصال بقاعدة Supabase",
    };
  }
}

export async function fetchAllAdminUsers(): Promise<AdminUser[]> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id,email,wallet_address,chain_key,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as AdminUser[]) ?? [];
  } catch (error) {
    console.error("Supabase user_profiles fetch failed:", error);
    return [];
  }
}

export async function fetchAllAdminDeposits(): Promise<DepositRecord[]> {
  try {
    const { data, error } = await supabase
      .from("deposit_records")
      .select("id,tx_hash,chain_key,status,amount,created_at,wallet_address")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((d) => ({
        id: d.id,
        hash: d.tx_hash,
        chain: d.chain_key as ChainKey,
        status: d.status as DepositStatus,
        amount: d.amount ?? 50,
        createdAt: d.created_at,
        walletAddress: d.wallet_address,
      }));
  } catch (error) {
    console.error("Supabase admin deposit_records fetch failed:", error);
    return [];
  }
}

export async function fetchAllAdminTransfers(): Promise<AdminTransferRecord[]> {
  try {
    const { data, error } = await supabase
      .from("admin_transfers")
      .select("id,recipient_address,chain_key,amount,status,tx_hash,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as AdminTransferRecord[]) ?? [];
  } catch (error) {
    console.error("Supabase admin_transfers fetch failed:", error);
    return [];
  }
}

export function fetchAllAdminInvestments(): InvestmentPlan[] {
  const all = safeJsonParse<InvestmentPlan[]>(INVESTMENTS_STORAGE_KEY, []);
  return all;
}

export function adminSimulate24hCycle(planId: string): InvestmentPlan {
  const all = safeJsonParse<InvestmentPlan[]>(INVESTMENTS_STORAGE_KEY, []);
  const idx = all.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error("الخطة غير موجودة");

  const plan = all[idx];
  // Shift startedAt and lastClaimAt backwards by 24h
  const updatedPlan: InvestmentPlan = {
    ...plan,
    startedAt: new Date(new Date(plan.startedAt).getTime() - 24 * 60 * 60 * 1000).toISOString(),
    lastClaimAt: new Date(new Date(plan.lastClaimAt).getTime() - 24 * 60 * 60 * 1000).toISOString(),
  };

  all[idx] = updatedPlan;
  safeJsonSet(INVESTMENTS_STORAGE_KEY, all);

  // Update in user plans
  const userPlans = loadUserInvestments(plan.userId);
  const uIdx = userPlans.findIndex((p) => p.id === planId);
  if (uIdx >= 0) {
    userPlans[uIdx] = updatedPlan;
    saveUserInvestments(plan.userId, userPlans);
  }

  return updatedPlan;
}
