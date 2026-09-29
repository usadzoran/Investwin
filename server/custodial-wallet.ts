import { Contract, JsonRpcProvider, Wallet, getAddress, formatUnits } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

type WalletConfig = {
  network: "mainnet" | "amoy";
  chainId: 137 | 80002;
  rpcUrl: string;
  token: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function getPolygonWalletConfig(): WalletConfig {
  const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
  return {
    network,
    chainId: network === "amoy" ? 80002 : 137,
    rpcUrl: requiredEnv("POLYGON_RPC_URL"),
    token: getAddress(requiredEnv("POLYGON_USDT_ADDRESS")),
  };
}

export function getServiceDb(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getAuthenticatedDb(accessToken: string): SupabaseClient {
  const key = process.env.SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_KEY?.trim();
  if (!key) throw new Error("Missing SUPABASE_ANON_KEY for authenticated wallet operations");
  return createClient(requiredEnv("SUPABASE_URL"), key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function getCustodialWallet(userId: string) {
  const db = getServiceDb();
  const [{ data: profile, error: profileError }, { data: balance, error: balanceError }] = await Promise.all([
    db.from("user_profiles").select("polygon_deposit_address,polygon_withdrawal_address").eq("user_id", userId).maybeSingle(),
    db.from("custodial_wallet_balances").select("available,pending,asset,network").eq("user_id", userId).maybeSingle(),
  ]);
  if (profileError) throw new Error(`Unable to read custodial wallet profile: ${profileError.message}`);
  if (balanceError) throw new Error(`Unable to read custodial wallet balance: ${balanceError.message}`);
  const config = getPolygonWalletConfig();
  return {
    network: `polygon-${config.network}`,
    chain_id: config.chainId,
    asset: "USDT",
    deposit_address: profile?.polygon_deposit_address ?? null,
    withdrawal_address: profile?.polygon_withdrawal_address ?? null,
    available: String(balance?.available ?? "0"),
    pending: String(balance?.pending ?? "0"),
  };
}

export async function processPolygonWithdrawal(withdrawalId: string) {
  if (process.env.POLYGON_WITHDRAWALS_ENABLED !== "true") {
    throw new Error("Custodial withdrawals are disabled; set POLYGON_WITHDRAWALS_ENABLED=true after testing");
  }
  const db = getServiceDb();
  const { data: request, error } = await db.from("polygon_withdrawal_requests")
    .select("id,user_id,destination_address,amount,status")
    .eq("id", withdrawalId).maybeSingle();
  if (error) throw new Error(`Unable to read withdrawal request: ${error.message}`);
  if (!request) throw new Error("Withdrawal request not found");
  if (request.status !== "pending") throw new Error(`Withdrawal is already ${request.status}`);

  const { error: lockError } = await db.from("polygon_withdrawal_requests")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", withdrawalId).eq("status", "pending");
  if (lockError) throw new Error(`Unable to lock withdrawal request: ${lockError.message}`);

  const config = getPolygonWalletConfig();
  const provider = new JsonRpcProvider(config.rpcUrl, { name: `polygon-${config.network}`, chainId: config.chainId });
  const signer = new Wallet(requiredEnv("POLYGON_WITHDRAWAL_PRIVATE_KEY"), provider);
  const token = new Contract(config.token, ERC20_ABI, signer);
  const decimals = Number(await token.decimals());
  const amount = BigInt(Math.round(Number(request.amount) * 10 ** decimals));
  if (amount <= BigInt(0)) throw new Error("Withdrawal amount is invalid");
  const tx = await token.transfer(getAddress(request.destination_address), amount);

  try {
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error("Withdrawal transaction failed on-chain");
    const { error: finalizeError } = await db.rpc("finalize_polygon_withdrawal", {
      p_withdrawal_id: withdrawalId, p_status: "confirmed", p_tx_hash: receipt.hash, p_error_message: null,
    });
    if (finalizeError) throw new Error(`Withdrawal sent but settlement failed: ${finalizeError.message}`);
    return { status: "confirmed", tx_hash: receipt.hash, amount: formatUnits(amount, decimals), chain_id: config.chainId };
  } catch (error) {
    await db.rpc("finalize_polygon_withdrawal", {
      p_withdrawal_id: withdrawalId, p_status: "failed", p_tx_hash: null,
      p_error_message: error instanceof Error ? error.message : "Withdrawal failed",
    });
    throw error;
  }
}
