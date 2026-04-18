import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
// Use a throwaway-but-valid base58 wallet (the system program id) for DB writes
const TEST_WALLET = "11111111111111111111111111111112";
// Claude-backed tests are skipped when the key is absent so CI/dev without
// the secret (or behind network restrictions) stays green.
const HAS_ANTHROPIC_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

test.describe("DCA orders API", () => {
  test("creates and lists an active DCA order", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/api/dca`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "dca",
          inputToken: "USDC",
          outputToken: "SOL",
          amountUsd: 20,
          interval: "weekly",
          day_of_week: "monday",
        },
      },
    });
    const createJson = (await createRes.json()) as {
      success: boolean;
      data?: { id: string; interval: string; input_token: string; output_token: string; amount_usd: number; day_of_week: number | null };
    };
    expect(createJson.success).toBe(true);
    expect(createJson.data?.interval).toBe("weekly");
    expect(createJson.data?.input_token).toBe("USDC");
    expect(createJson.data?.output_token).toBe("SOL");
    expect(createJson.data?.amount_usd).toBe(20);
    expect(createJson.data?.day_of_week).toBe(1); // Monday

    const listRes = await request.get(`${BASE_URL}/api/dca?wallet=${TEST_WALLET}`);
    const listJson = (await listRes.json()) as { success: boolean; data: Array<{ id: string }> };
    expect(listJson.success).toBe(true);
    expect(listJson.data.some((o) => o.id === createJson.data?.id)).toBe(true);

    // Cleanup
    if (createJson.data?.id) {
      await request.post(`${BASE_URL}/api/dca/${createJson.data.id}/cancel`, {
        data: { walletPubkey: TEST_WALLET },
      });
    }
  });

  test("cancel endpoint deactivates the order", async ({ request }) => {
    const create = await request.post(`${BASE_URL}/api/dca`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "dca",
          inputToken: "USDC",
          outputToken: "BONK",
          amountUsd: 5,
          interval: "daily",
        },
      },
    });
    const createJson = (await create.json()) as { success: boolean; data?: { id: string } };
    expect(createJson.success).toBe(true);
    const id = createJson.data?.id as string;

    const cancel = await request.post(`${BASE_URL}/api/dca/${id}/cancel`, {
      data: { walletPubkey: TEST_WALLET },
    });
    expect((await cancel.json()).success).toBe(true);

    const list = await request.get(`${BASE_URL}/api/dca?wallet=${TEST_WALLET}`);
    const listJson = (await list.json()) as { success: boolean; data: Array<{ id: string }> };
    expect(listJson.data.some((o) => o.id === id)).toBe(false);
  });

  test("rejects unsupported tokens", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/dca`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "dca",
          inputToken: "FAKE",
          outputToken: "SOL",
          amountUsd: 10,
          interval: "daily",
        },
      },
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
  });
});

test.describe("Price alerts API", () => {
  test("creates and lists alerts", async ({ request }) => {
    const create = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 200,
          direction: "above",
        },
      },
    });
    const createJson = (await create.json()) as {
      success: boolean;
      data?: { id: string; token: string; direction: string; target_price: number };
    };
    expect(createJson.success).toBe(true);
    expect(createJson.data?.token).toBe("SOL");
    expect(createJson.data?.direction).toBe("above");
    expect(createJson.data?.target_price).toBe(200);

    const list = await request.get(`${BASE_URL}/api/price-alerts?wallet=${TEST_WALLET}`);
    const listJson = (await list.json()) as { success: boolean; data: Array<{ id: string }> };
    expect(listJson.data.some((a) => a.id === createJson.data?.id)).toBe(true);

    if (createJson.data?.id) {
      await request.delete(`${BASE_URL}/api/price-alerts/${createJson.data.id}`, {
        data: { walletPubkey: TEST_WALLET },
      });
    }
  });

  test("parse-intent recognises DCA phrasing", async ({ request }) => {
    test.skip(!HAS_ANTHROPIC_KEY, "ANTHROPIC_API_KEY not set");
    const res = await request.post(`${BASE_URL}/api/parse-intent`, {
      data: { message: "buy $20 of SOL every Monday" },
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: { action: string; inputToken?: string; outputToken?: string; amountUsd?: number; interval?: string };
    };
    expect(json.success).toBe(true);
    expect(json.data?.action).toBe("dca");
    expect(json.data?.outputToken).toBe("SOL");
    expect(json.data?.amountUsd).toBe(20);
    expect(json.data?.interval).toBe("weekly");
  });

  test("parse-intent recognises price alert phrasing", async ({ request }) => {
    test.skip(!HAS_ANTHROPIC_KEY, "ANTHROPIC_API_KEY not set");
    const res = await request.post(`${BASE_URL}/api/parse-intent`, {
      data: { message: "alert me when SOL drops below $150" },
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: { action: string; token?: string; direction?: string; targetPrice?: number };
    };
    expect(json.success).toBe(true);
    expect(json.data?.action).toBe("price_alert");
    expect(json.data?.token).toBe("SOL");
    expect(json.data?.direction).toBe("below");
    expect(json.data?.targetPrice).toBe(150);
  });

  test("creates a swap-type (stop-loss) alert and stores all swap fields", async ({ request }) => {
    const create = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_from_token: "SOL",
          swap_to_token: "USDC",
          swap_amount_pct: 50,
          label: "Stop-loss: sell 50% SOL below $100",
        },
      },
    });
    const json = (await create.json()) as {
      success: boolean;
      data?: {
        id: string;
        action_type: string;
        swap_from_token: string;
        swap_to_token: string;
        swap_amount_pct: number;
        swap_amount_fixed: number | null;
        label: string;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data?.action_type).toBe("swap");
    expect(json.data?.swap_from_token).toBe("SOL");
    expect(json.data?.swap_to_token).toBe("USDC");
    expect(json.data?.swap_amount_pct).toBe(50);
    expect(json.data?.swap_amount_fixed).toBeNull();
    expect(json.data?.label).toContain("Stop-loss");

    if (json.data?.id) {
      await request.delete(`${BASE_URL}/api/price-alerts/${json.data.id}`, {
        data: { walletPubkey: TEST_WALLET },
      });
    }
  });

  test("creates a swap-type (dip-buy) alert with fixed USD amount", async ({ request }) => {
    const create = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "BONK",
          targetPrice: 0.00002,
          direction: "below",
          action_type: "swap",
          swap_from_token: "USDC",
          swap_to_token: "BONK",
          swap_amount_fixed: 50,
          label: "Dip buy: $50 BONK below 0.00002",
        },
      },
    });
    const json = (await create.json()) as {
      success: boolean;
      data?: { id: string; swap_amount_pct: number | null; swap_amount_fixed: number };
    };
    expect(json.success).toBe(true);
    expect(json.data?.swap_amount_pct).toBeNull();
    expect(json.data?.swap_amount_fixed).toBe(50);

    if (json.data?.id) {
      await request.delete(`${BASE_URL}/api/price-alerts/${json.data.id}`, {
        data: { walletPubkey: TEST_WALLET },
      });
    }
  });

  test("rejects swap alert with missing swap tokens", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_amount_pct: 50,
          // swap_from_token and swap_to_token intentionally omitted
        },
      },
    });
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  test("rejects swap alert with swap_amount_pct out of range", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_from_token: "SOL",
          swap_to_token: "USDC",
          swap_amount_pct: 150,
        },
      },
    });
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  test("rejects swap alert when both pct and fixed amounts are set", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_from_token: "SOL",
          swap_to_token: "USDC",
          swap_amount_pct: 50,
          swap_amount_fixed: 100,
        },
      },
    });
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  test("rejects swap alert with unsupported swap token", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_from_token: "FAKE",
          swap_to_token: "USDC",
          swap_amount_pct: 50,
        },
      },
    });
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  test("rejects swap alert when from and to tokens are identical", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/price-alerts`, {
      data: {
        walletPubkey: TEST_WALLET,
        intent: {
          action: "price_alert",
          token: "SOL",
          targetPrice: 100,
          direction: "below",
          action_type: "swap",
          swap_from_token: "SOL",
          swap_to_token: "SOL",
          swap_amount_pct: 50,
        },
      },
    });
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
