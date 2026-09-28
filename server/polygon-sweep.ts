import { JsonRpcProvider, Contract, HDNodeWallet, Wallet, getAddress, parseUnits, formatUnits } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

type SweepInput = { adminUserId: string; sourceUserId: string; amount?: string; dryRun?: boolean };

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getSweepConfig() {
  const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
  const chainId = network === "amoy" ? 80002 : 137;
  const rpcUrl = requiredEnv("POLYGON_RPC_URL");
  const treasury = getAddress(requiredEnv("POLYGON_TREASURY_ADDRESS"));
  const token = getAddress(requiredEnv("POLYGON_USDT_ADDRESS"));
  if (treasury === token) throw new Error("Treasury and token addresses must be different");
  return { network, chainId, rpcUrl, treasury, token };
}

function getDb(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getDepositWallet(index: number, provider: JsonRpcProvider) {
  const master = HDNodeWallet.fromPhrase(requiredEnv("POLYGON_DEPOSIT_MASTER_SEED"), undefined, "m/44'/60'/0'/0");
  return new Wallet(master.deriveChild(index).privateKey, provider);
}

export async function sweepPolygonUsdt(input: SweepInput) {
  if (input.adminUserId === input.sourceUserId) throw new Error("Invalid sweep actors");
  const config = getSweepConfig();
  const db = getDb();
  const { data: profile, error: profileError } = await db
    .from("user_profiles")
    .select("polygon_deposit_address,polygon_deposit_derivation_index")
    .eq("user_id", input.sourceUserId)
    .maybeSingle();
  if (profileError) throw new Error(`Unable to read deposit profile: ${profileError.message}`);
  if (!profile?.polygon_deposit_address || profile.polygon_deposit_derivation_index === null) {
    throw new Error("User has no Polygon deposit address");
  }

  const provider = new JsonRpcProvider(config.rpcUrl, { name: `polygon-${config.network}`, chainId: config.chainId });
  const wallet = getDepositWallet(profile.polygon_deposit_derivation_index, provider);
  const sourceAddress = await wallet.getAddress();
  if (sourceAddress.toLowerCase() !== profile.polygon_deposit_address.toLowerCase()) {
    throw new Error("Derived wallet does not match the saved deposit address");
  }
  const token = new Contract(config.token, ERC20_ABI, wallet);
  const decimals = Number(await token.decimals());
  const balance = await token.balanceOf(sourceAddress) as bigint;
  const requested = input.amount?.trim();
  const amount = requested ? parseUnits(requested, decimals) : balance;
  if (amount <= BigInt(0) || amount > balance) throw new Error("Insufficient USDT balance");

  const nativeBalance = await provider.getBalance(sourceAddress);
  const gasLimit = await token.transfer.estimateGas(config.treasury, amount);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!gasPrice) throw new Error("Unable to determine Polygon gas price");
  const estimatedFee = gasLimit * gasPrice;
  if (nativeBalance < estimatedFee) throw new Error(`Insufficient POL/MATIC for gas; need at least ${formatUnits(estimatedFee, 18)}`);

  if (input.dryRun) {
    return { dry_run: true, network: config.network, chain_id: config.chainId, source_address: sourceAddress, treasury_address: config.treasury, token_address: config.token, balance: formatUnits(balance, decimals), amount: formatUnits(amount, decimals), estimated_gas_fee: formatUnits(estimatedFee, 18) };
  }
  if (process.env.POLYGON_SWEEP_ENABLED !== "true") throw new Error("Sweeps are disabled; set POLYGON_SWEEP_ENABLED=true on the server");

  const { data: operation, error: insertError } = await db.from("polygon_sweep_operations").insert({
    admin_user_id: input.adminUserId, source_user_id: input.sourceUserId, source_address: sourceAddress,
    treasury_address: config.treasury, token_address: config.token, amount: formatUnits(amount, decimals), chain_id: config.chainId, status: "submitted",
  }).select("id").single();
  if (insertError) throw new Error(`Unable to create sweep audit record: ${insertError.message}`);

  try {
    const tx = await token.transfer(config.treasury, amount, { gasLimit });
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error("Sweep transaction failed on-chain");
    await db.from("polygon_sweep_operations").update({ tx_hash: receipt.hash, status: "confirmed", updated_at: new Date().toISOString() }).eq("id", operation.id);
    return { operation_id: operation.id, network: config.network, chain_id: config.chainId, source_address: sourceAddress, treasury_address: config.treasury, amount: formatUnits(amount, decimals), tx_hash: receipt.hash, status: "confirmed" };
  } catch (error) {
    await db.from("polygon_sweep_operations").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error", updated_at: new Date().toISOString() }).eq("id", operation.id);
    throw error;
  }
}
