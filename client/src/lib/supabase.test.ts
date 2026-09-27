import { describe, expect, it } from "vitest";

describe("Supabase configuration", () => {
  it("accepts the configured public key", async () => {
    const url = process.env.VITE_SUPABASE_URL || "https://vmhhriytxjeikorzoqcs.supabase.co";
    const key = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaGhyaXl0eGplaWtvcnpvcWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTYzMzUsImV4cCI6MjEwNTk5MjMzNX0.HxSSo5S89bpTM7cbRSCcqnTxXR1c73xVyGZtAFHJBCU";

    expect(url).toMatch(/^https:\/\/.*\.supabase\.co$/);
    expect(key).toBeTruthy();

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: key as string,
        Authorization: `Bearer ${key}`,
      },
    });

    expect(response.ok).toBe(true);
  });
});
