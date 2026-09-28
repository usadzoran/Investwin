import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getOrCreatePolygonDepositAddress, isValidSupabaseBearerToken } from "./deposit-address.js";
import { sweepPolygonUsdt } from "./polygon-sweep.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "16kb" }));

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Never expose the master seed or service-role key to the browser.
  const authClient = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  app.get("/api/polygon/deposit-address", async (req, res) => {
    const authorization = req.header("authorization");
    if (!authClient || !isValidSupabaseBearerToken(authorization)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const token = authorization!.replace(/^Bearer\s+/i, "");
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      const result = await getOrCreatePolygonDepositAddress(data.user.id);
      const network = process.env.POLYGON_NETWORK?.trim().toLowerCase() === "amoy" ? "amoy" : "mainnet";
      res.setHeader("Cache-Control", "no-store");
      res.json({ network: `polygon-${network}`, chain_id: network === "amoy" ? 80002 : 137, ...result });
    } catch (error) {
      console.error("Polygon deposit address error", error);
      res.status(500).json({ error: "Unable to allocate a Polygon deposit address" });
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
      if (error || !data.user) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      const { data: admin, error: adminError } = await authClient
        .from("admin_users").select("user_id").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
      if (adminError || !admin) {
        res.status(403).json({ error: "Admin permission required" });
        return;
      }
      const sourceUserId = typeof req.body?.source_user_id === "string" ? req.body.source_user_id : "";
      const amount = typeof req.body?.amount === "string" ? req.body.amount : undefined;
      const dryRun = req.body?.dry_run === true;
      if (!/^[0-9a-f-]{36}$/i.test(sourceUserId)) {
        res.status(400).json({ error: "A valid source_user_id is required" });
        return;
      }
      const result = await sweepPolygonUsdt({ adminUserId: data.user.id, sourceUserId, amount, dryRun });
      res.status(dryRun ? 200 : 201).json(result);
    } catch (error) {
      console.error("Polygon sweep error", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Sweep failed" });
    }
  });

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
