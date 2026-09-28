import { Contract, JsonRpcProvider, formatUnits, getAddress } from "ethers";
import { createClient } from "@supabase/supabase-js";

const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)", "function decimals() view returns (uint8)"];
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
};

export async function getPolygonTreasuryStats() {
  const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
  const chainId = network === "amoy" ? 80002 : 137;
  const provider = new JsonRpcProvider(required("POLYGON_RPC_URL"), { name: `polygon-${network}`, chainId });
  const treasury = getAddress(required("POLYGON_TREASURY_ADDRESS"));
  const tokenAddress = getAddress(required("POLYGON_USDT_ADDRESS"));
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  const [nativeBalance, decimals, tokenBalance, db] = await Promise.all([
    provider.getBalance(treasury),
    token.decimals() as Promise<bigint>,
    token.balanceOf(treasury) as Promise<bigint>,
    createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }).rpc("get_admin_treasury_stats"),
  ]);
  if (db.error) throw new Error(`Unable to read treasury statistics: ${db.error.message}`);
  const summary = (Array.isArray(db.data) ? db.data[0] : db.data) ?? {};
  return {
    network: `polygon-${network}`, chain_id: chainId, treasury_address: treasury, token_address: tokenAddress,
    usdt_balance: formatUnits(tokenBalance, Number(decimals)), native_balance: formatUnits(nativeBalance, 18),
    total_deposits: String(summary.total_deposits ?? 0), total_interest_distributed: String(summary.total_interest_distributed ?? 0),
    deposit_count: Number(summary.deposit_count ?? 0), confirmed_transfer_count: Number(summary.confirmed_transfer_count ?? 0),
  };
}
