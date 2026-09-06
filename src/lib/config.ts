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
  transferAmount: string;
  useIntentAmount: boolean;
  policyPath: string;
  ledgerPath: string;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const key = process.env.KEEPERHUB_API_KEY?.trim();
  return {
    keeperhubApiKey: key && key.length > 0 ? key : undefined,
    auditLedgerKey: process.env.AUDIT_LEDGER_KEY?.trim() || "demo-ledger-key-not-for-production",
    chainId: Number(process.env.KEEPERHUB_CHAIN_ID ?? "84532"),
    apiBase: (process.env.KEEPERHUB_API_BASE ?? "https://app.keeperhub.com").replace(/\/$/, ""),
    mcpUrl: process.env.KEEPERHUB_MCP_URL ?? "https://app.keeperhub.com/mcp",
    recipientAddress: (
      process.env.KEEPERHUB_RECIPIENT_ADDRESS ?? "0x000000000000000000000000000000000000dead"
    ).toLowerCase(),
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
