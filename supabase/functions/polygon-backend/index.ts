import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { HDNodeWallet, JsonRpcProvider, Contract, Wallet, formatUnits, parseUnits, getAddress, getBytes } from "npm:ethers@6.17.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Supabase Function secret: ${name}`);
  return value;
};
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const network = () => Deno.env.get("POLYGON_NETWORK")?.trim().toLowerCase() === "amoy" ? { name: "amoy", chainId: 80002 } : { name: "mainnet", chainId: 137 };
const config = () => ({ ...network(), rpcUrl: env("POLYGON_RPC_URL"), tokenAddress: getAddress(env("POLYGON_USDT_ADDRESS")) });

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
function parseErrorStatus(message: string) {
  if (/Authentication|required|Invalid or expired/i.test(message)) return 401;
  if (/Admin permission/i.test(message)) return 403;
  return 400;
}

async function depositAddress(req: Request) {
  const user = await requireUser(req);
  const db = admin();
  const { data: profile, error } = await db.from("user_profiles").select("polygon_deposit_address,polygon_deposit_derivation_index").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.polygon_deposit_address) return { network: `polygon-${network().name}`, chain_id: network().chainId, wallet_address: getAddress(profile.polygon_deposit_address), wallet_derivation_index: profile.polygon_deposit_derivation_index, claimed: false };
  const seed = env("POLYGON_DEPOSIT_MASTER_SEED");
  const normalizedHexSeed = seed.replace(/^0x/i, "");
  const isHexSeed = /^[0-9a-fA-F]+$/.test(normalizedHexSeed) && normalizedHexSeed.length >= 32 && normalizedHexSeed.length <= 128 && normalizedHexSeed.length % 2 === 0;
  let master: HDNodeWallet;
  try { master = isHexSeed ? HDNodeWallet.fromSeed(getBytes(`0x${normalizedHexSeed}`)).derivePath("m/44'/60'/0'/0") : HDNodeWallet.fromPhrase(seed, undefined, "m/44'/60'/0'/0"); }
  catch { throw new Error("Invalid POLYGON_DEPOSIT_MASTER_SEED"); }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.id));
  let index = new DataView(hash).getUint32(0);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const address = master.deriveChild(index).address;
    const { data, error: claimError } = await db.rpc("claim_polygon_deposit_wallet", { p_user_id: user.id, p_wallet_address: address, p_derivation_index: index });
    if (!claimError) { const row = Array.isArray(data) ? data[0] : data; return { network: `polygon-${network().name}`, chain_id: network().chainId, wallet_address: getAddress(row.wallet_address), wallet_derivation_index: row.wallet_derivation_index, claimed: Boolean(row.claimed) }; }
    if (!/conflict|unique/i.test(claimError.message)) throw new Error(claimError.message);
    index += 1;
  }
  throw new Error("Unable to allocate a unique deposit address");
}

async function custodialWallet(req: Request) {
  const user = await requireUser(req);
  const db = admin();
  const [{ data: profile, error: profileError }, { data: balance, error: balanceError }] = await Promise.all([
    db.from("user_profiles").select("polygon_deposit_address,polygon_withdrawal_address").eq("user_id", user.id).maybeSingle(),
    db.from("custodial_wallet_balances").select("available,pending,asset,network").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (balanceError) throw new Error(balanceError.message);
  return { network: `polygon-${network().name}`, chain_id: network().chainId, asset: "USDT", deposit_address: profile?.polygon_deposit_address ?? null, withdrawal_address: profile?.polygon_withdrawal_address ?? null, available: String(balance?.available ?? "0"), pending: String(balance?.pending ?? "0") };
}

async function setWithdrawalAddress(req: Request, body: Record<string, unknown>) {
  const user = await requireUser(req);
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const { data, error } = await admin().rpc("set_polygon_withdrawal_address", { p_address: address });
  if (error) throw new Error(error.message);
  return { user_id: user.id, withdrawal_address: data };
}

async function createWithdrawal(req: Request, body: Record<string, unknown>) {
  await requireUser(req);
  const amount = typeof body.amount === "string" || typeof body.amount === "number" ? body.amount : null;
  const key = typeof body.idempotency_key === "string" ? body.idempotency_key : crypto.randomUUID();
  const { data, error } = await admin().rpc("create_polygon_withdrawal", { p_amount: amount, p_idempotency_key: key });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.withdrawal_id) throw new Error("Withdrawal request was not created");
  return row;
}

async function processWithdrawal(req: Request, body: Record<string, unknown>) {
  await requireAdmin(req);
  if (Deno.env.get("POLYGON_WITHDRAWALS_ENABLED") !== "true") throw new Error("Custodial withdrawals are disabled");
  const withdrawalId = typeof body.withdrawal_id === "string" ? body.withdrawal_id : "";
  const db = admin();
  const { data: request, error } = await db.from("polygon_withdrawal_requests").select("id,user_id,destination_address,amount,status").eq("id", withdrawalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error("Withdrawal request not found");
  if (request.status !== "pending") throw new Error(`Withdrawal is already ${request.status}`);
  const { error: lockError } = await db.from("polygon_withdrawal_requests").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", withdrawalId).eq("status", "pending");
  if (lockError) throw new Error(lockError.message);
  const chain = config();
  const provider = new JsonRpcProvider(chain.rpcUrl, { name: `polygon-${chain.name}`, chainId: chain.chainId });
  const signer = new Wallet(env("POLYGON_WITHDRAWAL_PRIVATE_KEY"), provider);
  const token = new Contract(chain.tokenAddress, ERC20_ABI, signer);
  const decimals = Number(await token.decimals());
  const amount = parseUnits(String(request.amount), decimals);
  const tx = await token.transfer(getAddress(request.destination_address), amount);
  try {
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error("Withdrawal transaction failed on-chain");
    const { error: finalizeError } = await db.rpc("finalize_polygon_withdrawal", { p_withdrawal_id: withdrawalId, p_status: "confirmed", p_tx_hash: receipt.hash, p_error_message: null });
    if (finalizeError) throw new Error(`Withdrawal sent but settlement failed: ${finalizeError.message}`);
    return { status: "confirmed", tx_hash: receipt.hash, amount: formatUnits(amount, decimals), chain_id: chain.chainId };
  } catch (error) {
    await db.rpc("finalize_polygon_withdrawal", { p_withdrawal_id: withdrawalId, p_status: "failed", p_tx_hash: null, p_error_message: error instanceof Error ? error.message : "Withdrawal failed" });
    throw error;
  }
}

async function treasuryStats(req: Request) {
  await requireAdmin(req);
  const chain = config();
  const provider = new JsonRpcProvider(chain.rpcUrl, { name: `polygon-${chain.name}`, chainId: chain.chainId });
  const treasury = getAddress(env("POLYGON_TREASURY_ADDRESS"));
  const token = new Contract(chain.tokenAddress, ERC20_ABI, provider);
  const [native, decimals, balance, stats] = await Promise.all([provider.getBalance(treasury), token.decimals() as Promise<bigint>, token.balanceOf(treasury) as Promise<bigint>, admin().rpc("get_admin_treasury_stats")]);
  if (stats.error) throw new Error(stats.error.message);
  const row = (Array.isArray(stats.data) ? stats.data[0] : stats.data) ?? {};
  return { network: `polygon-${chain.name}`, chain_id: chain.chainId, treasury_address: treasury, token_address: chain.tokenAddress, usdt_balance: formatUnits(balance, Number(decimals)), native_balance: formatUnits(native, 18), total_deposits: String(row.total_deposits ?? 0), total_interest_distributed: String(row.total_interest_distributed ?? 0), deposit_count: Number(row.deposit_count ?? 0), confirmed_transfer_count: Number(row.confirmed_transfer_count ?? 0) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" || req.method === "PUT" ? await req.json().catch(() => ({})) : {};
    const action = typeof body.action === "string" ? body.action : new URL(req.url).searchParams.get("action");
    if (action === "deposit-address") return json(await depositAddress(req));
    if (action === "custodial-wallet") return json(await custodialWallet(req));
    if (action === "set-withdrawal-address") return json(await setWithdrawalAddress(req, body));
    if (action === "create-withdrawal") return json(await createWithdrawal(req, body), 201);
    if (action === "process-withdrawal") return json(await processWithdrawal(req, body), 201);
    if (action === "treasury-stats") return json(await treasuryStats(req));
    return json({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return json({ error: message }, parseErrorStatus(message));
  }
});
