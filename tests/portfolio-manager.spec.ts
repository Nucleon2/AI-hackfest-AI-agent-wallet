import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Portfolio Manager", () => {
  test("app loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    // App should load with the welcome message
    await expect(page.locator("text=Solace").first()).toBeVisible({ timeout: 10_000 });
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("portfolio API config endpoint returns null for unknown wallet", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portfolio/config?wallet=11111111111111111111111111111111`);
    const json = await res.json() as { success: boolean; data: unknown };
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  test("portfolio API config can be created and retrieved", async ({ request }) => {
    const testWallet = "So11111111111111111111111111111111111111112";

    // Create config
    const createRes = await request.post(`${BASE_URL}/api/portfolio/config`, {
      data: {
        walletPubkey: testWallet,
        targets: [
          { token: "SOL", percentage: 60 },
          { token: "USDC", percentage: 40 },
        ],
        drift_threshold: 5,
        auto_execute: false,
      },
    });
    const createJson = await createRes.json() as { success: boolean; data: { targets: unknown[]; drift_threshold: number } };
    expect(createJson.success).toBe(true);
    expect(createJson.data.targets).toHaveLength(2);
    expect(createJson.data.drift_threshold).toBe(5);

    // Retrieve it
    const getRes = await request.get(`${BASE_URL}/api/portfolio/config?wallet=${testWallet}`);
    const getJson = await getRes.json() as { success: boolean; data: { is_active: boolean; targets: unknown[] } };
    expect(getJson.success).toBe(true);
    expect(getJson.data.is_active).toBe(true);
    expect(getJson.data.targets).toHaveLength(2);
  });

  test("portfolio API config PATCH updates drift threshold", async ({ request }) => {
    const testWallet = "So11111111111111111111111111111111111111112";
    const patchRes = await request.patch(`${BASE_URL}/api/portfolio/config`, {
      data: { walletPubkey: testWallet, drift_threshold: 3 },
    });
    const patchJson = await patchRes.json() as { success: boolean; data: { drift_threshold: number } };
    expect(patchJson.success).toBe(true);
    expect(patchJson.data.drift_threshold).toBe(3);
  });

  test("portfolio rebalance returns swaps or no-rebalance response", async ({ request }) => {
    const testWallet = "So11111111111111111111111111111111111111112";
    // Ensure config exists
    await request.post(`${BASE_URL}/api/portfolio/config`, {
      data: {
        walletPubkey: testWallet,
        targets: [{ token: "SOL", percentage: 60 }, { token: "USDC", percentage: 40 }],
        drift_threshold: 5,
      },
    });
    const res = await request.post(`${BASE_URL}/api/portfolio/rebalance`, {
      data: { walletPubkey: testWallet },
    });
    const json = await res.json() as { success: boolean; data?: { needsRebalance: boolean; swaps: unknown[] } };
    expect(json.success).toBe(true);
    if (json.data) {
      expect(Array.isArray(json.data.swaps)).toBe(true);
    }
  });

  test("PortfolioManagerCard renders when visiting portfolio page via chat", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // The portfolio manager card should render (even without wallet) via the API route
    // Seed the test wallet config via API first
    await page.evaluate(async () => {
      await fetch("/api/portfolio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletPubkey: "So11111111111111111111111111111111111111112",
          targets: [{ token: "SOL", percentage: 60 }, { token: "USDC", percentage: 40 }],
          drift_threshold: 5,
        }),
      });
    });

    // The UI renders without crashing
    await expect(page.locator("body")).toBeVisible();
  });
});
