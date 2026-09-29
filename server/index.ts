import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getOrCreatePolygonDepositAddress, isValidSupabaseBearerToken } from "./deposit-address.js";
import { sweepPolygonUsdt } from "./polygon-sweep.js";
import { getPolygonTreasuryStats } from "./treasury-stats.js";
import { getAuthenticatedDb, getCustodialWallet, processPolygonWithdrawal } from "./custodial-wallet.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "16kb" }));

  const staticPath = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));

  // Never expose the master seed, withdrawal key, or service-role key to the browser.
  const authClient = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  async function authenticatedUser(req: express.Request) {
    const authorization = req.header("authorization");
    if (!authClient || !isValidSupabaseBearerToken(authorization)) throw new Error("Authentication required");
    const token = authorization!.replace(/^Bearer\s+/i, "");
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid or expired session");
    return { user: data.user, token };
  }

  app.get("/api/polygon/deposit-address", async (req, res) => {
    try {
      const { user } = await authenticatedUser(req);
      const result = await getOrCreatePolygonDepositAddress(user.id);
      const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
      res.setHeader("Cache-Control", "no-store");
      res.json({ network: `polygon-${network}`, chain_id: network === "amoy" ? 80002 : 137, ...result });
    } catch (error) {
      console.error("Polygon deposit address error", error);
      const message = error instanceof Error ? error.message : "Unable to allocate a Polygon deposit address";
      res.status(message.includes("Authentication") || message.includes("session") ? 401 : 500).json({ error: message });
    }
  });

  app.get("/api/polygon/custodial-wallet", async (req, res) => {
    try {
      const { user } = await authenticatedUser(req);
      res.setHeader("Cache-Control", "no-store");
      res.json(await getCustodialWallet(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load custodial wallet";
      res.status(message.includes("Authentication") || message.includes("session") ? 401 : 500).json({ error: message });
    }
  });

  app.put("/api/polygon/custodial-wallet/withdrawal-address", async (req, res) => {
    try {
      const { user, token } = await authenticatedUser(req);
      const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
      const { data, error } = await getAuthenticatedDb(token).rpc("set_polygon_withdrawal_address", { p_address: address });
      if (error) throw new Error(error.message);
      res.status(200).json({ user_id: user.id, withdrawal_address: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save withdrawal address";
      res.status(message.includes("Authentication") || message.includes("session") ? 401 : 400).json({ error: message });
    }
  });

  app.post("/api/polygon/custodial-wallet/withdrawals", async (req, res) => {
    try {
      const { token } = await authenticatedUser(req);
      const amount = typeof req.body?.amount === "number" || typeof req.body?.amount === "string" ? req.body.amount : null;
      const idempotencyKey = typeof req.body?.idempotency_key === "string" ? req.body.idempotency_key : "";
      const { data, error } = await getAuthenticatedDb(token).rpc("create_polygon_withdrawal", { p_amount: amount, p_idempotency_key: idempotencyKey });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.withdrawal_id) throw new Error("Withdrawal request was not created");
      res.status(201).json(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create withdrawal request";
      res.status(message.includes("Authentication") || message.includes("session") ? 401 : 400).json({ error: message });
    }
  });

  app.post("/api/admin/polygon/sweep", async (req, res) => {
    const authorization = req.header("authorization");
    if (!authClient || !isValidSupabaseBearerToken(authorization)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const token = authorization!.replace(/^Bearer\s+/i, "");
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) { res.status(401).json({ error: "Invalid or expired session" }); return; }
      const { data: admin, error: adminError } = await authClient.from("admin_users").select("user_id").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
      if (adminError || !admin) { res.status(403).json({ error: "Admin permission required" }); return; }
      const sourceUserId = typeof req.body?.source_user_id === "string" ? req.body.source_user_id : "";
      const amount = typeof req.body?.amount === "string" ? req.body.amount : undefined;
      const dryRun = req.body?.dry_run === true;
      if (!/^[0-9a-f-]{36}$/i.test(sourceUserId)) { res.status(400).json({ error: "A valid source_user_id is required" }); return; }
      const result = await sweepPolygonUsdt({ adminUserId: data.user.id, sourceUserId, amount, dryRun });
      res.status(dryRun ? 200 : 201).json(result);
    } catch (error) {
      console.error("Polygon sweep error", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Sweep failed" });
    }
  });

  app.post("/api/admin/polygon/withdrawals/:id/process", async (req, res) => {
    const authorization = req.header("authorization");
    if (!authClient || !isValidSupabaseBearerToken(authorization)) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const token = authorization!.replace(/^Bearer\s+/i, "");
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) { res.status(401).json({ error: "Invalid or expired session" }); return; }
      const { data: admin, error: adminError } = await authClient.from("admin_users").select("user_id").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
      if (adminError || !admin) { res.status(403).json({ error: "Admin permission required" }); return; }
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) { res.status(400).json({ error: "Invalid withdrawal id" }); return; }
      res.status(201).json(await processPolygonWithdrawal(req.params.id));
    } catch (error) {
      console.error("Polygon withdrawal processing error", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal processing failed" });
    }
  });

  app.get("/api/admin/polygon/treasury-stats", async (req, res) => {
    const authorization = req.header("authorization");
    if (!authClient || !isValidSupabaseBearerToken(authorization)) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const token = authorization!.replace(/^Bearer\s+/i, "");
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) { res.status(401).json({ error: "Invalid or expired session" }); return; }
      const { data: admin, error: adminError } = await authClient.from("admin_users").select("user_id").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
      if (adminError || !admin) { res.status(403).json({ error: "Admin permission required" }); return; }
      res.setHeader("Cache-Control", "no-store");
      res.json(await getPolygonTreasuryStats());
    } catch (error) {
      console.error("Polygon treasury stats error", error);
      res.status(500).json({ error: "Unable to load Polygon treasury statistics" });
    }
  });

  app.get("*", (_req, res) => { res.sendFile(path.join(staticPath, "index.html")); });
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
