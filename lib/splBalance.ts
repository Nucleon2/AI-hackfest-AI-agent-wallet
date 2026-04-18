import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_REGISTRY } from "./tokenRegistry";

export async function fetchTokenUiBalance(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  cachedSolBalance?: number | null
): Promise<number | null> {
  if (symbol === "SOL") {
    if (cachedSolBalance != null) return cachedSolBalance;
    try {
      const lamports = await connection.getBalance(owner);
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return null;
    }
  }
  const info = TOKEN_REGISTRY[symbol];
  if (!info) return null;
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(info.mint),
    });
    let total = 0;
    for (const { account } of accounts.value) {
      const parsed = account.data.parsed as {
        info: { tokenAmount: { uiAmount: number | null } };
      };
      total += parsed.info.tokenAmount.uiAmount ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}
