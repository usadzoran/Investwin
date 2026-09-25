import { describe, expect, it } from "vitest";

describe("Supabase configuration", () => {
  it("accepts the configured public key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;

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
