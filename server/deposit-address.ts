import { createHash } from "node:crypto";
import { HDNodeWallet, getAddress } from "ethers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type DepositAddressResult = {
  wallet_address: string;
  wallet_derivation_index: number | null;
  claimed: boolean;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getAdminClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getMasterNode() {
  const phrase = requiredEnv("POLYGON_DEPOSIT_MASTER_SEED");
  // ethers validates the BIP-39 phrase. This seed must never be sent to the browser.
  return HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0");
}

function initialDerivationIndex(userId: string) {
  const digest = createHash("sha256").update(userId).digest();
  // Keep the index within a safe JS integer and leave room for conflict retries.
  return digest.readUInt32BE(0);
}

function isConflict(error: unknown) {
  return error instanceof Error && /polygon_derivation_index_conflict|unique/i.test(error.message);
}

export async function getOrCreatePolygonDepositAddress(userId: string): Promise<DepositAddressResult> {
  const supabase = getAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("polygon_deposit_address,polygon_deposit_derivation_index")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Unable to read user profile: ${profileError.message}`);
  if (profile?.polygon_deposit_address) {
    return {
      wallet_address: getAddress(profile.polygon_deposit_address),
      wallet_derivation_index: profile.polygon_deposit_derivation_index ?? null,
      claimed: false,
    };
  }

  const master = getMasterNode();
  let index = initialDerivationIndex(userId);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const child = master.deriveChild(index);
    const address = child.address;
    const { data, error } = await supabase.rpc("claim_polygon_deposit_wallet", {
      p_user_id: userId,
      p_wallet_address: address,
      p_derivation_index: index,
    });
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as DepositAddressResult | null;
      if (!row?.wallet_address) throw new Error("The database did not return a deposit address");
      return {
        wallet_address: getAddress(row.wallet_address),
        wallet_derivation_index: row.wallet_derivation_index,
        claimed: Boolean(row.claimed),
      };
    }
    if (!isConflict(error)) throw new Error(`Unable to claim Polygon deposit address: ${error.message}`);
    index += 1;
  }
  throw new Error("Unable to allocate a unique Polygon deposit address after retries");
}

export function isValidSupabaseBearerToken(value: string | undefined) {
  return Boolean(value && /^Bearer\s+\S+$/i.test(value));
}
