import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

export type AppConfig = {
  keeperhubApiKey?: string;
  auditLedgerKey: string;
  chainId: number;
  apiBase: string;
  mcpUrl: string;
  recipientAddress: string;
  /** ERC-20 contract for execute_transfer. Undefined / empty = native. */
  tokenAddress?: string;
  transferAmount: string;
  useIntentAmount: boolean;
  policyPath: string;
  ledgerPath: string;
};

export function parseTokenAddress(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`KEEPERHUB_TOKEN_ADDRESS must be a 20-byte hex address, got ${trimmed}`);
  }
  // KeeperHub accepts all-lowercase or valid EIP-55. Preserve mixed-case checksums.
  return /[A-F]/.test(trimmed.slice(2)) ? trimmed : trimmed.toLowerCase();
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const key = process.env.KEEPERHUB_API_KEY?.trim();
  const fromEnv = parseTokenAddress(process.env.KEEPERHUB_TOKEN_ADDRESS);
  return {
    keeperhubApiKey: key && key.length > 0 ? key : undefined,
    auditLedgerKey: process.env.AUDIT_LEDGER_KEY?.trim() || "demo-ledger-key-not-for-production",
    chainId: Number(process.env.KEEPERHUB_CHAIN_ID ?? "84532"),
    apiBase: (process.env.KEEPERHUB_API_BASE ?? "https://app.keeperhub.com").replace(/\/$/, ""),
    mcpUrl: process.env.KEEPERHUB_MCP_URL ?? "https://app.keeperhub.com/mcp",
    recipientAddress: (
      process.env.KEEPERHUB_RECIPIENT_ADDRESS ?? "0x000000000000000000000000000000000000dead"
    ).toLowerCase(),
    tokenAddress: fromEnv,
    transferAmount: process.env.KEEPERHUB_TRANSFER_AMOUNT ?? "0.001",
    useIntentAmount: process.env.KEEPERHUB_USE_INTENT_AMOUNT === "true",
    policyPath: process.env.CHP_POLICY_PATH ?? resolve(process.cwd(), "policy.example.yaml"),
    ledgerPath: process.env.CHP_LEDGER_PATH ?? resolve(process.cwd(), ".chp/ledger.jsonl"),
    ...overrides,
  };
}

export function readTextIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
