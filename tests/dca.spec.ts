import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
// Use a throwaway-but-valid base58 wallet (the system program id) for DB writes
const TEST_WALLET = "11111111111111111111111111111112";

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
});
