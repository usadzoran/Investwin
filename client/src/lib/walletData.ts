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
