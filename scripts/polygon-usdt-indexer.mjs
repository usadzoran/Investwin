import { Interface, JsonRpcProvider, formatUnits, getAddress, id } from "ethers";
import { createClient } from "@supabase/supabase-js";

if (process.env.POLYGON_INDEXER_ENABLED !== "true") {
  console.error("Indexer disabled. Set POLYGON_INDEXER_ENABLED=true only on a protected backend worker.");
  process.exit(0);
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
const chainId = network === "amoy" ? 80002 : 137;
const rpcUrl = required("POLYGON_RPC_URL");
const tokenAddress = getAddress(required("POLYGON_USDT_ADDRESS"));
const confirmations = Number(process.env.POLYGON_INDEXER_CONFIRMATIONS ?? 20);
const batchSize = Number(process.env.POLYGON_INDEXER_BLOCK_BATCH ?? 1500);
const startBlock = Number(process.env.POLYGON_INDEXER_START_BLOCK ?? 0);
const intervalMs = Number(process.env.POLYGON_INDEXER_INTERVAL_MS ?? 15000);
if (!Number.isInteger(confirmations) || confirmations < 1) throw new Error("POLYGON_INDEXER_CONFIRMATIONS must be a positive integer");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error("POLYGON_INDEXER_BLOCK_BATCH must be between 1 and 5000");

const provider = new JsonRpcProvider(rpcUrl, { name: `polygon-${network}`, chainId });
const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const transferTopic = id("Transfer(address,address,uint256)");
const transferInterface = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
let running = false;

async function loadProfiles() {
  const profiles = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("user_profiles")
      .select("user_id,polygon_deposit_address")
      .not("polygon_deposit_address", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(`Unable to load deposit addresses: ${error.message}`);
    for (const row of data ?? []) profiles.set(row.polygon_deposit_address.toLowerCase(), row);
    if (!data || data.length < 1000) break;
  }
  return profiles;
}

async function getNextBlock() {
  const { data, error } = await supabase.from("polygon_indexer_state").select("next_block").eq("chain_id", chainId).maybeSingle();
  if (error) throw new Error(`Unable to read indexer state: ${error.message}`);
  if (data) return Number(data.next_block);
  const { error: insertError } = await supabase.from("polygon_indexer_state").insert({ chain_id: chainId, token_address: tokenAddress.toLowerCase(), next_block: startBlock });
  if (insertError && !/duplicate|unique/i.test(insertError.message)) throw new Error(`Unable to initialize indexer state: ${insertError.message}`);
  return startBlock;
}

async function setNextBlock(nextBlock) {
  const { error } = await supabase.from("polygon_indexer_state").update({ token_address: tokenAddress.toLowerCase(), next_block: nextBlock, updated_at: new Date().toISOString() }).eq("chain_id", chainId);
  if (error) throw new Error(`Unable to save indexer state: ${error.message}`);
}

async function scanOnce() {
  const latest = await provider.getBlockNumber();
  const safeHead = latest - confirmations;
  const nextBlock = await getNextBlock();
  if (nextBlock > safeHead) return { scanned: false, nextBlock, safeHead, credited: 0 };

  const toBlock = Math.min(nextBlock + batchSize - 1, safeHead);
  const profiles = await loadProfiles();
  const logs = await provider.getLogs({ address: tokenAddress, topics: [transferTopic], fromBlock: nextBlock, toBlock });
  let credited = 0;
  for (const log of logs) {
    const parsed = transferInterface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) continue;
    const recipient = String(parsed.args.to).toLowerCase();
    const profile = profiles.get(recipient);
    if (!profile) continue;
    const amount = formatUnits(parsed.args.value, 6);
    const { data, error } = await supabase.rpc("record_polygon_usdt_deposit", {
      p_user_id: profile.user_id,
      p_wallet_address: profile.polygon_deposit_address,
      p_tx_hash: log.transactionHash,
      p_amount: amount,
      p_block_number: log.blockNumber,
    });
    if (error) throw new Error(`Unable to credit ${log.transactionHash}: ${error.message}`);
    const { error: custodialError } = await supabase.rpc("record_polygon_custodial_deposit", {
      p_user_id: profile.user_id,
      p_amount: amount,
      p_tx_hash: log.transactionHash,
      p_log_index: Number(log.index ?? 0),
      p_metadata: { block_number: log.blockNumber, token_address: tokenAddress.toLowerCase(), deposit_address: profile.polygon_deposit_address },
    });
    if (custodialError) throw new Error(`Unable to credit custodial balance for ${log.transactionHash}: ${custodialError.message}`);
    if (data === true) {
      credited += 1;
      console.log(JSON.stringify({ event: "deposit_credited", network, user_id: profile.user_id, address: profile.polygon_deposit_address, amount, tx_hash: log.transactionHash, block: log.blockNumber }));
    }
  }
  await setNextBlock(toBlock + 1);
  return { scanned: true, fromBlock: nextBlock, toBlock, events: logs.length, credited };
}

async function tick() {
  if (running) return;
  running = true;
  try { console.log(JSON.stringify({ event: "indexer_tick", ...(await scanOnce()) })); }
  catch (error) { console.error(JSON.stringify({ event: "indexer_error", message: error instanceof Error ? error.message : String(error) })); }
  finally { running = false; }
}

console.log(JSON.stringify({ event: "indexer_started", network, chain_id: chainId, token: tokenAddress, confirmations, batchSize, intervalMs }));
await tick();
setInterval(() => void tick(), intervalMs);
