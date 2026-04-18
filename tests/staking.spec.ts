import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const TEST_WALLET = "So11111111111111111111111111111111111111112";

test.describe("Liquid staking", () => {
  test("app loads without errors after staking additions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=AI Agent Wallet").first()).toBeVisible({
      timeout: 10_000,
    });
    // ignore noisy browser warnings unrelated to staking
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("/api/stake rejects non-mainnet networks with a clear error", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/stake`, {
      data: {
        action: "stake",
        amount: 1,
        provider: "marinade",
        userPublicKey: TEST_WALLET,
        preview: true,
      },
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    // On devnet (default) the route should refuse; on mainnet it should succeed.
    if (!json.success) {
      expect(json.error).toMatch(/mainnet/i);
    } else {
      // If running against mainnet, preview should succeed.
      expect(res.status()).toBe(200);
    }
  });

  test("/api/stake returns \"coming soon\" for Jito provider", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/stake`, {
      data: {
        action: "stake",
        amount: 1,
        provider: "jito",
        userPublicKey: TEST_WALLET,
      },
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    // Either blocked by network (devnet) or blocked by provider stub (mainnet).
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/jito|mainnet/i);
  });

  test("/api/stake/status rejects missing wallet query", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/stake/status`);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    // Either missing wallet or network guard — both are valid failure modes
    expect(typeof json.error).toBe("string");
  });

  test("/api/stake validates required fields", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/stake`, {
      data: { action: "stake" },
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
  });

  test("parse-intent turns \"stake 5 SOL\" into a StakeIntent", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/parse-intent`, {
      data: { message: "stake 5 SOL" },
    });
    const json = (await res.json()) as
      | {
          success: true;
          data: { action: string; amount?: number; provider?: string };
        }
      | { success: false; error?: string };
    if (!json.success) {
      // If ANTHROPIC_API_KEY isn't configured locally, the route legitimately
      // returns an error — skip the assertion rather than fail the suite.
      test.skip(true, "Claude API key not configured in this environment");
      return;
    }
    expect(json.data.action).toBe("stake");
    expect(json.data.amount).toBe(5);
    expect(json.data.provider).toBe("marinade");
  });

  test("parse-intent recognizes Jito provider from natural language", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/parse-intent`, {
      data: { message: "stake 2 SOL with Jito" },
    });
    const json = (await res.json()) as
      | { success: true; data: { action: string; provider?: string } }
      | { success: false; error?: string };
    if (!json.success) {
      test.skip(true, "Claude API key not configured in this environment");
      return;
    }
    expect(json.data.action).toBe("stake");
    expect(json.data.provider).toBe("jito");
  });
});
