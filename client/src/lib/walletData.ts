import { supabase } from "@/lib/supabase";
import type { ChainKey } from "@/lib/wallet";

export type DepositStatus = "pending" | "completed" | "failed";
export type DepositRecord = { id: string; hash: string; chain: ChainKey; status: DepositStatus; amount?: number; createdAt: string; walletAddress?: string; userId?: string };

export type AdminUser = { user_id: string; email: string | null; wallet_address: string | null; chain_key: ChainKey | null; created_at?: string };
export type AdminTransferRecord = { id: string; recipient_address: string; chain_key: ChainKey; amount: number; status: string; tx_hash: string | null; created_at: string; admin_user_id?: string; recipient_user_id?: string | null };
export type UserNotification = {
  id: string;
  user_id: string;
  type: "payout_confirmed" | "deposit_confirmed" | "system";
  title: string;
  body: string;
  tx_hash: string | null;
  amount: number | null;
  chain_key: ChainKey | null;
  is_read: boolean;
  created_at: string;
};

// Global persistent storage keys for seamless database fallback & real data persistence
const STORAGE_PREFIX = "noura_db_";
const USERS_STORAGE_KEY = `${STORAGE_PREFIX}users`;
const DEPOSITS_STORAGE_KEY = `${STORAGE_PREFIX}deposits`;
const TRANSFERS_STORAGE_KEY = `${STORAGE_PREFIX}transfers`;
const INVESTMENTS_STORAGE_KEY = `${STORAGE_PREFIX}investments`;
const WITHDRAWALS_STORAGE_KEY = `${STORAGE_PREFIX}withdrawals`;
const WITHDRAWAL_LOCK_PREFIX = `${STORAGE_PREFIX}withdrawal_lock_`;
export const DAILY_WITHDRAWAL_LIMIT_USDT = 1000;

export type CentralWithdrawalSummary = {
  withdrawn: number;
  remaining: number;
  limit: number;
};

export type WithdrawalKind = "profit" | "principal";
export type WithdrawalRecord = {
  id: string;
  userId: string;
  walletAddress: string;
  planId: string;
  amount: number;
  kind: WithdrawalKind;
  createdAt: string;
};

function centralSecurityError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("withdrawal_daily_limit_exceeded")) return "تم تجاوز الحد اليومي المركزي للسحب لهذه المحفظة.";
  if (message.includes("withdrawal_duplicate")) return "تم تنفيذ طلب السحب هذا مسبقًا.";
  if (message.includes("withdrawal_wallet_mismatch")) return "المحفظة المتصلة لا تطابق المحفظة المسجلة مركزيًا.";
  if (message.includes("withdrawal_auth_required")) return "انتهت جلسة الحساب. سجّل الدخول ثم حاول مرة أخرى.";
  if (message.includes("withdrawal_invalid_input")) return "بيانات السحب غير صالحة.";
  if (message.includes("function") && message.includes("does not exist")) return "حماية السحب المركزية غير مفعلة بعد. شغّل ملف supabase/withdrawal_security.sql أولًا.";
  return "تعذر التحقق من حماية السحب المركزية. لم يتم تنفيذ السحب.";
}

export async function getCentralWithdrawalSummary(walletAddress: string): Promise<CentralWithdrawalSummary> {
  const { data, error } = await supabase.rpc("get_withdrawal_summary", {
    p_wallet_address: walletAddress,
    p_daily_limit: DAILY_WITHDRAWAL_LIMIT_USDT,
  });
  if (error) throw new Error(centralSecurityError(error));
  const row = Array.isArray(data) ? data[0] : data;
  return {
    withdrawn: Number(row?.withdrawn_today ?? 0),
    remaining: Number(row?.remaining_today ?? DAILY_WITHDRAWAL_LIMIT_USDT),
    limit: Number(row?.daily_limit ?? DAILY_WITHDRAWAL_LIMIT_USDT),
  };
}

export async function reserveCentralWithdrawal(input: {
  userId: string;
  walletAddress: string;
  planId: string;
  kind: WithdrawalKind;
  amount: number;
  cycleKey: string;
}): Promise<CentralWithdrawalSummary> {
  const { data, error } = await supabase.rpc("reserve_withdrawal", {
    p_user_id: input.userId,
    p_wallet_address: input.walletAddress,
    p_plan_id: input.planId,
    p_kind: input.kind,
    p_amount: input.amount,
    p_cycle_key: input.cycleKey,
    p_daily_limit: DAILY_WITHDRAWAL_LIMIT_USDT,
  });
  if (error) throw new Error(centralSecurityError(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.withdrawal_id) throw new Error("تعذر إنشاء حجز السحب المركزي. لم يتم تنفيذ السحب.");
  return {
    withdrawn: Number(row.withdrawn_today),
    remaining: Number(row.remaining_today),
    limit: DAILY_WITHDRAWAL_LIMIT_USDT,
  };
}

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
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("يجب تسجيل الدخول قبل استخدام المحفظة.");
  return data.user;
}

export async function loadOrCreatePolygonDepositAddress(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("انتهت جلسة المستخدم.");
  const { data, error } = await supabase.functions.invoke("polygon-backend", { body: { action: "deposit-address" } });
  if (!error && data?.wallet_address) return data.wallet_address as string;
  // Allows already-generated addresses to remain visible even while API_BASE is being configured.
  const { data: profile, error: profileError } = await supabase.from("user_profiles").select("polygon_deposit_address").eq("user_id", session.user.id).maybeSingle();
  if (profileError) throw new Error(`تعذر تحميل عنوان إيداع Polygon: ${profileError.message}`);
  if (profile?.polygon_deposit_address) return profile.polygon_deposit_address;
  let functionMessage = error?.message ?? "لم يتم إعداد Edge Function لعناوين الإيداع بعد.";
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const payload = await response.clone().json() as { error?: unknown; message?: unknown };
      const detail = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
      if (detail) functionMessage = detail;
    } catch {
      // Keep the SDK message when the function response is not JSON.
    }
  }
  throw new Error(`تعذر إنشاء عنوان إيداع Polygon: ${functionMessage}`);
}

export type CustodialWallet = {
  depositAddress: string | null;
  withdrawalAddress: string | null;
  available: number;
  pending: number;
  network: "polygon";
};

export async function loadCustodialWallet(): Promise<CustodialWallet> {
  const { data, error } = await supabase.functions.invoke("polygon-backend", { body: { action: "custodial-wallet" } });
  if (error) throw new Error(error.message);
  return {
    depositAddress: data?.deposit_address ?? null,
    withdrawalAddress: data?.withdrawal_address ?? null,
    available: Number(data?.available ?? 0),
    pending: Number(data?.pending ?? 0),
    network: "polygon",
  };
}

export async function saveCustodialWithdrawalAddress(address: string) {
  const { data, error } = await supabase.functions.invoke("polygon-backend", { body: { action: "set-withdrawal-address", address: address.trim() } });
  if (error) throw new Error(error.message);
  return String(data?.withdrawal_address);
}

export async function requestCustodialWithdrawal(amount: string) {
  const { data, error } = await supabase.functions.invoke("polygon-backend", { body: { action: "create-withdrawal", amount, idempotency_key: crypto.randomUUID() } });
  if (error) throw new Error(error.message);
  const row = data;
  if (!row?.withdrawal_id) throw new Error("تعذر إنشاء طلب السحب.");
  return row as { withdrawal_id: string; status: string; available: number; pending: number; destination_address: string };
}

export async function loadUserNotifications(userId: string): Promise<UserNotification[]> {
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id,user_id,type,title,body,tx_hash,amount,chain_key,is_read,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`تعذر تحميل الإشعارات: ${error.message}`);
  return (data ?? []) as UserNotification[];
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase.from("user_notifications").update({ is_read: true }).eq("id", notificationId);
  if (error) throw new Error(`تعذر تحديث الإشعار: ${error.message}`);
}

export function subscribeToUserNotifications(userId: string, onNotification: (notification: UserNotification) => void) {
  const channel = supabase
    .channel(`user-notifications:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` }, (payload) => {
      onNotification(payload.new as UserNotification);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
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

export async function recordAdminTransfer(input: {
  adminUserId: string;
  recipientUserId?: string;
  recipientAddress: string;
  chain: ChainKey;
  amount: number;
  txHash: string;
  status?: "draft" | "submitted" | "confirmed" | "failed";
}) {
  const { data, error } = await supabase.from("admin_transfers").insert({
    admin_user_id: input.adminUserId,
    recipient_user_id: input.recipientUserId || null,
    recipient_address: input.recipientAddress.toLowerCase(),
    chain_key: input.chain,
    token_symbol: "USDT",
    amount: input.amount,
    tx_hash: input.txHash,
    status: input.status ?? "confirmed",
  }).select("id,recipient_address,chain_key,amount,status,tx_hash,created_at").single();
  if (error) throw new Error(`تعذر تسجيل تحويل الأدمن: ${error.message}`);
  if (input.recipientUserId) {
    const { error: notificationError } = await supabase.from("user_notifications").insert({
      user_id: input.recipientUserId,
      type: "payout_confirmed",
      title: "تم إرسال فائدتك اليومية",
      body: `أرسل الأدمن ${input.amount.toFixed(2)} USDT إلى محفظتك على ${input.chain === "bnb" ? "BNB Chain" : input.chain}.`,
      tx_hash: input.txHash,
      amount: input.amount,
      chain_key: input.chain,
    });
    if (notificationError) console.error("Payout notification creation failed:", notificationError);
  }
  return data as AdminTransferRecord;
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

function normalizeWalletAddress(address: string) {
  return address.trim().toLowerCase();
}

function utcDay(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function getWalletDailyWithdrawalSummary(walletAddress: string, now = new Date()) {
  const wallet = normalizeWalletAddress(walletAddress);
  const records = safeJsonParse<WithdrawalRecord[]>(WITHDRAWALS_STORAGE_KEY, []);
  const withdrawnToday = records
    .filter((record) => normalizeWalletAddress(record.walletAddress) === wallet && utcDay(new Date(record.createdAt)) === utcDay(now))
    .reduce((total, record) => total + record.amount, 0);
  return {
    limit: DAILY_WITHDRAWAL_LIMIT_USDT,
    withdrawn: +withdrawnToday.toFixed(2),
    remaining: +Math.max(0, DAILY_WITHDRAWAL_LIMIT_USDT - withdrawnToday).toFixed(2),
  };
}

function acquireWithdrawalLock(walletAddress: string) {
  const key = `${WITHDRAWAL_LOCK_PREFIX}${normalizeWalletAddress(walletAddress)}`;
  const existing = safeJsonParse<{ createdAt: number } | null>(key, null);
  if (existing && Date.now() - existing.createdAt < 30_000) throw new Error("هناك عملية سحب قيد المعالجة. انتظر قليلًا ثم حاول مرة أخرى.");
  safeJsonSet(key, { createdAt: Date.now() });
  return () => { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } };
}

function authorizeWithdrawal(input: { userId: string; walletAddress: string; plan: InvestmentPlan; amount: number }) {
  if (!input.walletAddress.trim() || normalizeWalletAddress(input.plan.walletAddress) !== normalizeWalletAddress(input.walletAddress)) {
    throw new Error("يجب أن تتطابق المحفظة المتصلة مع محفظة خطة الاستثمار.");
  }
  if (input.plan.userId !== input.userId) throw new Error("لا تملك صلاحية سحب هذه الخطة.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("مبلغ السحب غير صالح.");
  const summary = getWalletDailyWithdrawalSummary(input.walletAddress);
  if (input.amount > summary.remaining) {
    throw new Error(`تجاوز الحد اليومي للسحب. المتاح لمحفظتك اليوم: ${summary.remaining.toFixed(2)} USDT من ${summary.limit.toFixed(2)} USDT.`);
  }
  return { release: acquireWithdrawalLock(input.walletAddress), summary };
}

function recordWithdrawal(input: Omit<WithdrawalRecord, "id" | "createdAt">) {
  const records = safeJsonParse<WithdrawalRecord[]>(WITHDRAWALS_STORAGE_KEY, []);
  records.push({ ...input, id: `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() });
  safeJsonSet(WITHDRAWALS_STORAGE_KEY, records);
}

function validateWithdrawalOwnership(userId: string, walletAddress: string, plan: InvestmentPlan) {
  if (plan.userId !== userId || !walletAddress.trim() || normalizeWalletAddress(plan.walletAddress) !== normalizeWalletAddress(walletAddress)) {
    throw new Error("يجب أن تتطابق المحفظة المتصلة مع محفظة خطة الاستثمار.");
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

export async function claimInvestmentProfits(userId: string, planId: string, walletAddress: string): Promise<{ claimed: number; plan: InvestmentPlan; security: CentralWithdrawalSummary }> {
  const plans = loadUserInvestments(userId);
  const index = plans.findIndex((p) => p.id === planId);
  if (index === -1) throw new Error("الخطة غير موجودة.");

  const plan = plans[index];
  const { claimableProfit, isCompleted } = getPlanEarningsInfo(plan);

  if (claimableProfit <= 0) {
    throw new Error("لم تنتهِ دورة الـ 24 ساعة الحالية بعد للحصول على أرباح جديدة.");
  }

  validateWithdrawalOwnership(userId, walletAddress, plan);
  const security = await reserveCentralWithdrawal({
    userId, walletAddress, planId, kind: "profit", amount: claimableProfit,
    cycleKey: `profit:${plan.lastClaimAt}`,
  });
  const updatedPlan: InvestmentPlan = {
    ...plan,
    claimedProfits: +(plan.claimedProfits + claimableProfit).toFixed(2),
    lastClaimAt: new Date().toISOString(),
    status: isCompleted ? "completed" : "active",
  };
  plans[index] = updatedPlan;
  saveUserInvestments(userId, plans);
  recordWithdrawal({ userId, walletAddress, planId, amount: claimableProfit, kind: "profit" });
  return { claimed: claimableProfit, plan: updatedPlan, security };
}

export async function withdrawPlanPrincipal(userId: string, planId: string, walletAddress: string): Promise<InvestmentPlan> {
  const plans = loadUserInvestments(userId);
  const index = plans.findIndex((p) => p.id === planId);
  if (index === -1) throw new Error("الخطة غير موجودة.");

  const plan = plans[index];
  if (plan.status === "withdrawn") throw new Error("تم سحب رأس مال هذه الخطة مسبقًا.");
  validateWithdrawalOwnership(userId, walletAddress, plan);
  await reserveCentralWithdrawal({ userId, walletAddress, planId, kind: "principal", amount: plan.amount, cycleKey: "principal" });
  const updatedPlan: InvestmentPlan = {
    ...plan,
    status: "withdrawn",
  };

  plans[index] = updatedPlan;
  saveUserInvestments(userId, plans);
  recordWithdrawal({ userId, walletAddress, planId, amount: plan.amount, kind: "principal" });
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

export type PolygonTreasuryStats = {
  network: string;
  chain_id: number;
  treasury_address: string;
  token_address: string;
  usdt_balance: string;
  native_balance: string;
  total_deposits: string;
  total_interest_distributed: string;
  deposit_count: number;
  confirmed_transfer_count: number;
};

export async function fetchPolygonTreasuryStats(): Promise<PolygonTreasuryStats> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("انتهت جلسة الأدمن.");
  const { data, error } = await supabase.functions.invoke("polygon-backend", { body: { action: "treasury-stats" } });
  if (error || !data?.usdt_balance) throw new Error(error?.message ?? "تعذر تحميل إحصاءات الخزينة.");
  return data as PolygonTreasuryStats;
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
