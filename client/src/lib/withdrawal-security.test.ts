import { beforeEach, describe, expect, it, vi } from "vitest";

const centralReservations = new Set<string>();
vi.mock("./supabase", () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: { p_plan_id?: string; p_kind?: string; p_cycle_key?: string; p_amount?: number }) => {
      if (name === "get_withdrawal_summary") return { data: [{ withdrawn_today: 0, remaining_today: 1000, daily_limit: 1000 }], error: null };
      const key = `${args.p_plan_id}:${args.p_kind}:${args.p_cycle_key}`;
      if (centralReservations.has(key)) return { data: null, error: { message: "withdrawal_duplicate" } };
      centralReservations.add(key);
      return { data: [{ withdrawal_id: "central-id", withdrawn_today: args.p_amount ?? 0, remaining_today: 1000 - (args.p_amount ?? 0) }], error: null };
    }),
  },
}));

import {
  DAILY_WITHDRAWAL_LIMIT_USDT,
  claimInvestmentProfits,
  createInvestmentPlan,
  getWalletDailyWithdrawalSummary,
  saveUserInvestments,
  withdrawPlanPrincipal,
} from "./walletData";

class MemoryStorage {
  private data = new Map<string, string>();
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe("withdrawal security", () => {
  beforeEach(() => {
    centralReservations.clear();
    (globalThis as typeof globalThis & { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it("enforces the per-wallet daily limit summary", () => {
    const wallet = "0xAbC";
    localStorage.setItem("noura_db_withdrawals", JSON.stringify([{
      id: "wd_existing", userId: "user-1", walletAddress: wallet, planId: "plan-existing",
      amount: DAILY_WITHDRAWAL_LIMIT_USDT - 100, kind: "profit", createdAt: new Date().toISOString(),
    }]));
    expect(getWalletDailyWithdrawalSummary(wallet).remaining).toBe(100);
    expect(getWalletDailyWithdrawalSummary(wallet).withdrawn).toBe(900);
  });

  it("rejects a withdrawal from a wallet that does not own the plan", async () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    await expect(withdrawPlanPrincipal("user-1", plan.id, "0xAttacker")).rejects.toThrow("تتطابق المحفظة");
  });

  it("rejects principal withdrawal twice centrally", async () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    await withdrawPlanPrincipal("user-1", plan.id, "0xOwner");
    await expect(withdrawPlanPrincipal("user-1", plan.id, "0xOwner")).rejects.toThrow("مسبقًا");
  });

  it("does not allow claiming the same profit cycle twice centrally", async () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    const readyPlan = { ...plan, startedAt: new Date(Date.now() - 86_400_001).toISOString(), lastClaimAt: new Date(Date.now() - 86_400_001).toISOString() };
    saveUserInvestments("user-1", [readyPlan]);
    await claimInvestmentProfits("user-1", plan.id, "0xOwner");
    await expect(claimInvestmentProfits("user-1", plan.id, "0xOwner")).rejects.toThrow("دورة الـ 24 ساعة");
  });
});
