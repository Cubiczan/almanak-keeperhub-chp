#!/usr/bin/env node
import { resolve } from "node:path";
import { demoDipMarket } from "../almanak/market.js";
import { TreasuryDipBuyStrategy } from "../almanak/treasury-dip-buy.js";
import { loadPolicy } from "../chp/policy.js";
import { HmacAuditLedger } from "../chp/ledger.js";
import { loadConfig } from "../lib/config.js";
import { createKeeperHub } from "../keeperhub/client.js";
import { runGovernedCycle } from "../pipeline.js";

const blocked = process.argv.includes("--blocked");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

function line(char = "═", width = 72): string {
  return char.repeat(width);
}

function heading(title: string): void {
  console.log(`\n${CYAN}${line()}${RESET}`);
  console.log(`${BOLD}${title}${RESET}`);
  console.log(`${CYAN}${line()}${RESET}`);
}

function kv(key: string, value: string): void {
  console.log(`  ${DIM}${key.padEnd(22)}${RESET}${value}`);
}

function banner(): void {
  console.log(`${BOLD}${MAGENTA}`);
  console.log(line());
  console.log("  Almanak KeeperGate");
  console.log("  Almanak intent → Cubiczan CHP → KeeperHub execution");
  console.log("  DoraHacks · KeeperHub Agent Economy");
  console.log(line());
  console.log(RESET);
}

function colorState(state: string): string {
  switch (state) {
    case "LOCKED":
      return `${GREEN}${BOLD}${state}${RESET}`;
    case "BLOCKED":
      return `${RED}${BOLD}${state}${RESET}`;
    case "HITL_REQUIRED":
      return `${YELLOW}${BOLD}${state}${RESET}`;
    default:
      return `${CYAN}${state}${RESET}`;
  }
}

async function main(): Promise<void> {
  banner();

  const config = loadConfig({
    ledgerPath: resolve(process.cwd(), blocked ? ".chp/ledger-blocked.jsonl" : ".chp/ledger-demo.jsonl"),
  });
  const policy = loadPolicy(config.policyPath);
  const ledger = new HmacAuditLedger(config.auditLedgerKey, config.ledgerPath);
  const keeperhub = createKeeperHub(config);
  const market = demoDipMarket();
  const strategy = new TreasuryDipBuyStrategy({
    clipUsd: blocked ? "5000" : "25",
  });

  kv("path", blocked ? "BLOCKED-by-policy (oversize clip)" : "happy path (LOCKED + simulate/execute)");
  kv("strategy", `${strategy.name}.decide()`);
  kv("policy", `${policy.policyId} v${policy.version}`);
  kv("KeeperHub", keeperhub.mode === "MOCK" ? `${YELLOW}MOCK (no API key)${RESET}` : `${GREEN}LIVE${RESET}`);
  kv("chain preference", String(config.chainId));
  kv("MCP", config.mcpUrl);
  kv("REST", `${config.apiBase}/api/execute/transfer`);

  heading("1. Almanak strategy intent");
  kv("ETH", `$${market.price("ETH")}`);
  kv("USDC balance", `$${market.balance("USDC").balanceUsd}`);
  kv("rule", `ETH < $2000 and USDC > $500 → Intent.swap(USDC, ETH, $${strategy.clipUsd})`);

  const result = await runGovernedCycle({
    strategy,
    market,
    policy,
    config,
    ledger,
    keeperhub,
  });

  if (!result.intent) {
    console.log("  Strategy returned None — cycle skipped.");
    return;
  }

  const serialized = result.intent.serialize();
  console.log(`\n  ${BOLD}decide() → ${serialized.intent_type}${RESET}`);
  console.log(`  ${JSON.stringify(serialized, null, 2).replace(/^/gm, "  ")}`);

  heading("2. Compile → KeeperHub execution plan");
  if (result.plan) {
    kv("kind", result.plan.kind);
    kv("notional USD", result.plan.notionalUsd ?? "n/a");
    kv("chain", result.plan.chainLabel ?? "unresolved");
    kv("venue", result.plan.venue ?? "n/a");
    kv("confidence", result.plan.confidence ?? "n/a");
    if (result.plan.keeperHub) {
      kv("KH tool", result.plan.keeperHub.tool);
      kv("KH chainId", String(result.plan.keeperHub.chainId));
      kv("KH amount", result.plan.keeperHub.amount);
      kv("KH recipient", result.plan.keeperHub.recipientAddress);
    }
    for (const note of result.plan.notes) {
      console.log(`  ${DIM}• ${note}${RESET}`);
    }
  }

  heading("3. CHP gate  EXPLORING → PROVISIONAL → LOCKED | HITL | BLOCKED");
  if (result.decision) {
    kv("trail", result.decision.trail.map(colorState).join(" → "));
    kv("state", colorState(result.decision.state));
    kv("daily spent", `${result.decision.dailySpentUsd} USD`);
    kv("daily remaining", `${result.decision.dailyRemainingUsd} USD`);
    for (const reason of result.decision.reasons) {
      console.log(`  ${DIM}[${reason.code}]${RESET} ${reason.message}`);
    }
  }

  heading("4. KeeperHub simulate (simulate: true)");
  if (result.simulation) {
    kv("mode", result.simulation.mode);
    kv("success", String(result.simulation.success));
    kv("wouldRevert", String(result.simulation.wouldRevert));
    kv("gasEstimate", result.simulation.gasEstimate ?? "n/a");
    if (result.simulation.error) kv("error", result.simulation.error);
  } else {
    console.log(`  ${DIM}Skipped — gate did not LOCK.${RESET}`);
  }

  heading("5. KeeperHub execute (LOCKED only)");
  if (result.execution) {
    kv("mode", result.execution.mode);
    kv("label", result.execution.label);
    kv("executionId", result.execution.executionId ?? "n/a");
    kv("status", result.execution.status ?? "n/a");
    kv(
      "tx hash",
      result.execution.transactionHash ??
        (result.execution.mock ? `${YELLOW}(none — MOCK path never fabricates a hash)${RESET}` : "n/a"),
    );
    if (result.execution.transactionLink) kv("tx link", result.execution.transactionLink);
    if (result.execution.error) kv("error", result.execution.error);
  } else {
    console.log(`  ${DIM}No execute — CHP state is ${result.decision?.state ?? "n/a"}.${RESET}`);
  }

  heading("6. Dual audit trail");
  if (result.ledgerEntry) {
    kv("CHP seq", String(result.ledgerEntry.seq));
    kv("CHP HMAC", result.ledgerEntry.hmac);
    kv("prevHash", result.ledgerEntry.prevHash);
    kv("ledger file", config.ledgerPath);
    const verified = ledger.verify();
    kv("HMAC verify", verified.ok ? `${GREEN}ok${RESET}` : `${RED}BROKEN ${verified.reason}${RESET}`);
    kv(
      "KeeperHub audit",
      result.execution?.executionId
        ? `${result.execution.mode} id=${result.execution.executionId}`
        : "no KeeperHub execution id (gated)",
    );
  }

  heading("How to land a real DoraHacks tx");
  console.log(`  1. Copy .env.example → .env and set KEEPERHUB_API_KEY=kh_...`);
  console.log(`  2. Create the key at https://app.keeperhub.com (org API keys).`);
  console.log(`  3. Connect a wallet integration and fund it on Base Sepolia (84532).`);
  console.log(`  4. Set KEEPERHUB_RECIPIENT_ADDRESS to a checksummed or lowercase address.`);
  console.log(`  5. Re-run npm run demo — simulate then execute_transfer, then record the tx hash.`);
  console.log(`  MCP (same key): ${config.mcpUrl}`);
  console.log("");

  if (blocked && result.decision?.state !== "BLOCKED") {
    process.exitCode = 1;
  }
  if (!blocked && result.decision?.state !== "LOCKED") {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
