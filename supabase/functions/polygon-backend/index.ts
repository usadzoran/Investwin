import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { HDNodeWallet, JsonRpcProvider, Contract, formatUnits, getAddress, getBytes } from "npm:ethers@6.17.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)", "function decimals() view returns (uint8)"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Supabase Function secret: ${name}`);
  return value;
};
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const network = () => Deno.env.get("POLYGON_NETWORK")?.trim().toLowerCase() === "amoy" ? { name: "amoy", chainId: 80002 } : { name: "mainnet", chainId: 137 };

async function requireUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user;
}

async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  const { data, error } = await admin().from("admin_users").select("user_id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (error || !data) throw new Error("Admin permission required");
  return user;
}

async function depositAddress(req: Request) {
  const user = await requireUser(req);
  const db = admin();
  const { data: profile, error } = await db.from("user_profiles").select("polygon_deposit_address,polygon_deposit_derivation_index").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.polygon_deposit_address) return { network: `polygon-${network().name}`, chain_id: network().chainId, wallet_address: getAddress(profile.polygon_deposit_address), wallet_derivation_index: profile.polygon_deposit_derivation_index, claimed: false };
  const seed = env("POLYGON_DEPOSIT_MASTER_SEED");
  // Accept either a BIP-39 mnemonic (12/24 words) or a 32-byte hex seed
  // stored only in Supabase Function Secrets. Never expose this value to clients.
  const normalizedHexSeed = seed.replace(/^0x/i, "");
  const isHexSeed = /^[0-9a-fA-F]+$/.test(normalizedHexSeed)
    && normalizedHexSeed.length >= 32
    && normalizedHexSeed.length <= 128
    && normalizedHexSeed.length % 2 === 0;
  let master: HDNodeWallet;
  try {
    master = isHexSeed
      ? HDNodeWallet.fromSeed(getBytes(`0x${normalizedHexSeed}`)).derivePath("m/44'/60'/0'/0")
      : HDNodeWallet.fromPhrase(seed, undefined, "m/44'/60'/0'/0");
  } catch {
    throw new Error("Invalid POLYGON_DEPOSIT_MASTER_SEED: use a 12/24-word BIP-39 phrase or hexadecimal seed of 16-64 bytes");
  }
  // Deterministic per-user starting point; the SQL unique index handles collisions.
  const digest = new TextEncoder().encode(user.id);
  const hash = await crypto.subtle.digest("SHA-256", digest);
  const view = new DataView(hash);
  let index = view.getUint32(0);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const address = master.deriveChild(index).address;
    const { data, error: claimError } = await db.rpc("claim_polygon_deposit_wallet", { p_user_id: user.id, p_wallet_address: address, p_derivation_index: index });
    if (!claimError) {
      const row = Array.isArray(data) ? data[0] : data;
      return { network: `polygon-${network().name}`, chain_id: network().chainId, wallet_address: getAddress(row.wallet_address), wallet_derivation_index: row.wallet_derivation_index, claimed: Boolean(row.claimed) };
    }
    if (!/conflict|unique/i.test(claimError.message)) throw new Error(claimError.message);
    index += 1;
  }
  throw new Error("Unable to allocate a unique deposit address");
}

async function treasuryStats(req: Request) {
  await requireAdmin(req);
  const config = network();
  const provider = new JsonRpcProvider(env("POLYGON_RPC_URL"), { name: `polygon-${config.name}`, chainId: config.chainId });
  const treasury = getAddress(env("POLYGON_TREASURY_ADDRESS"));
  const tokenAddress = getAddress(env("POLYGON_USDT_ADDRESS"));
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  const db = admin();
  const [native, decimals, balance, stats] = await Promise.all([
    provider.getBalance(treasury),
    token.decimals() as Promise<bigint>,
    token.balanceOf(treasury) as Promise<bigint>,
    db.rpc("get_admin_treasury_stats"),
  ]);
  if (stats.error) throw new Error(stats.error.message);
  const row = (Array.isArray(stats.data) ? stats.data[0] : stats.data) ?? {};
  return { network: `polygon-${config.name}`, chain_id: config.chainId, treasury_address: treasury, token_address: tokenAddress, usdt_balance: formatUnits(balance, Number(decimals)), native_balance: formatUnits(native, 18), total_deposits: String(row.total_deposits ?? 0), total_interest_distributed: String(row.total_interest_distributed ?? 0), deposit_count: Number(row.deposit_count ?? 0), confirmed_transfer_count: Number(row.confirmed_transfer_count ?? 0) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = typeof body.action === "string" ? body.action : new URL(req.url).searchParams.get("action");
    if (action === "deposit-address") return json(await depositAddress(req));
    if (action === "treasury-stats") return json(await treasuryStats(req));
    return json({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /Authentication|required|Invalid|Admin permission/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
