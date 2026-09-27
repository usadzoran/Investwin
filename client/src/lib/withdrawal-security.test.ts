import { beforeEach, describe, expect, it } from "vitest";
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
    (globalThis as typeof globalThis & { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it("enforces the per-wallet daily limit", () => {
    const wallet = "0xAbC";
    localStorage.setItem("noura_db_withdrawals", JSON.stringify([{
      id: "wd_existing",
      userId: "user-1",
      walletAddress: wallet,
      planId: "plan-existing",
      amount: DAILY_WITHDRAWAL_LIMIT_USDT - 100,
      kind: "profit",
      createdAt: new Date().toISOString(),
    }]));
    expect(getWalletDailyWithdrawalSummary(wallet).remaining).toBe(100);
    expect(getWalletDailyWithdrawalSummary(wallet).withdrawn).toBe(900);
  });

  it("rejects a withdrawal from a wallet that does not own the plan", () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    expect(() => withdrawPlanPrincipal("user-1", plan.id, "0xAttacker")).toThrow("تتطابق المحفظة");
  });

  it("rejects principal withdrawal twice", () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    withdrawPlanPrincipal("user-1", plan.id, "0xOwner");
    expect(() => withdrawPlanPrincipal("user-1", plan.id, "0xOwner")).toThrow("مسبقًا");
  });

  it("does not allow claiming the same profit cycle twice", () => {
    const plan = createInvestmentPlan({ userId: "user-1", walletAddress: "0xOwner", amount: 10, durationDays: 7 });
    const readyPlan = { ...plan, startedAt: new Date(Date.now() - 86_400_001).toISOString(), lastClaimAt: new Date(Date.now() - 86_400_001).toISOString() };
    saveUserInvestments("user-1", [readyPlan]);
    claimInvestmentProfits("user-1", plan.id, "0xOwner");
    expect(() => claimInvestmentProfits("user-1", plan.id, "0xOwner")).toThrow("دورة الـ 24 ساعة");
  });
});
