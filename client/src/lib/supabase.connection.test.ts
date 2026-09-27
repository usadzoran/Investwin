import { describe, expect, it } from "vitest";

describe("Supabase connection", () => {
  it("accepts the configured project and Auth endpoint", async () => {
    const url = process.env.VITE_SUPABASE_URL || "https://vmhhriytxjeikorzoqcs.supabase.co";
    const key = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaGhyaXl0eGplaWtvcnpvcWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTYzMzUsImV4cCI6MjEwNTk5MjMzNX0.HxSSo5S89bpTM7cbRSCcqnTxXR1c73xVyGZtAFHJBCU";

    expect(url).toMatch(/^https:\/\/[^/]+\.supabase\.co$/);
    expect(key).toMatch(/^eyJ/);

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key as string },
    });

    expect(response.status).toBe(200);
    const settings = await response.json();
    expect(settings).toHaveProperty("external");
  }, 20_000);
});
