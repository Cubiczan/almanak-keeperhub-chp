import { createHash } from "node:crypto";
import { canonicalizeAmount } from "../lib/money.js";

/**
 * KeeperHub stable Idempotency-Key:
 * SHA-256 of taskId|chainId|recipientAddress|amount|tokenAddress
 * https://docs.keeperhub.com/api/direct-execution
 */
export function keeperHubIdempotencyKey(input: {
  taskId: string;
  chainId: number;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
}): string {
  const taskId = encodePart(input.taskId.trim());
  const chainId = String(input.chainId);
  const recipient = input.recipientAddress.toLowerCase();
  const amount = canonicalizeAmount(input.amount);
  const token = input.tokenAddress?.toLowerCase() ?? "";
  const joined = `${taskId}|${chainId}|${recipient}|${amount}|${token}`;
  return createHash("sha256").update(joined, "utf8").digest("hex");
}

function encodePart(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("|", "%7C");
}
