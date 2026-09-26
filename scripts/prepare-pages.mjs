import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("dist/public");
const routes = ["login", "signup", "wallet", "noura-ops-7x4k9", "404"];

for (const route of routes) {
  const directory = path.join(output, route);
  await mkdir(directory, { recursive: true });
  await cp(path.join(output, "index.html"), path.join(directory, "index.html"));
}

await cp(path.join(output, "index.html"), path.join(output, "404.html"));
console.log(`GitHub Pages route fallbacks prepared: ${routes.join(", ")}`);
