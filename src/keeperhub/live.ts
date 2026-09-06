import { keeperHubIdempotencyKey } from "./idempotency.js";
import type { ExecuteResult, KeeperHubExecutor, SimulateResult, TransferRequest } from "./types.js";

type Json = Record<string, unknown>;

export class LiveKeeperHub implements KeeperHubExecutor {
  readonly mode = "LIVE" as const;

  constructor(
    private readonly apiKey: string,
    private readonly apiBase: string,
  ) {
    if (!apiKey.startsWith("kh_")) {
      throw new Error("KEEPERHUB_API_KEY must start with kh_ (org API key).");
    }
  }

  async simulateTransfer(req: TransferRequest): Promise<SimulateResult> {
    const body = transferBody(req, true);
    const { status, json } = await this.post("/api/execute/transfer", body);
    if (status >= 400) {
      return {
        success: false,
        status: "simulated",
        wouldRevert: json.wouldRevert === true,
        failureKind: asString(json.failureKind),
        revertReason: asString(json.revertReason) ?? asString(json.error),
        error: asString(json.error) ?? `HTTP ${status}`,
        from: asString(json.from),
        to: asString(json.to),
        value: asString(json.value),
        gasEstimate: asString(json.gasEstimate),
        mode: "LIVE",
      };
    }
    return {
      success: json.success !== false && json.wouldRevert !== true,
      status: "simulated",
      from: asString(json.from),
      to: asString(json.to),
      value: asString(json.value),
      gasEstimate: asString(json.gasEstimate),
      simulatedReturnValue: json.simulatedReturnValue,
      wouldRevert: json.wouldRevert === true,
      mode: "LIVE",
    };
  }

  async executeTransfer(req: TransferRequest): Promise<ExecuteResult> {
    const body = transferBody(req, false);
    const idempotencyKey = keeperHubIdempotencyKey(req);
    const { status, json } = await this.post("/api/execute/transfer", body, {
      "Idempotency-Key": idempotencyKey,
    });
    if (status >= 400) {
      const originalId = asString(json.originalExecutionId);
      if (status === 409 && originalId) {
        return this.getStatus(originalId);
      }
      return {
        mode: "LIVE",
        mock: false,
        label: "LIVE KeeperHub execute_transfer failed",
        executionId: originalId,
        status: "failed",
        error: asString(json.error) ?? asString(json.code) ?? `HTTP ${status}`,
        idempotentReplay: json.idempotentReplay === true,
      };
    }
    const executionId = asString(json.executionId);
    if (executionId && json.status !== "completed" && json.status !== "failed") {
      return this.pollStatus(executionId);
    }
    return this.toExecute(json, "LIVE KeeperHub execute_transfer");
  }

  async getStatus(executionId: string): Promise<ExecuteResult> {
    const { status, json, pollHint } = await this.get(`/api/execute/${executionId}/status`);
    if (status >= 400) {
      return {
        mode: "LIVE",
        mock: false,
        label: "LIVE KeeperHub status read failed",
        executionId,
        status: "unknown",
        error: asString(json.error) ?? `HTTP ${status}`,
      };
    }
    const result = this.toExecute(json, "LIVE KeeperHub execution status");
    result.executionId = result.executionId ?? executionId;
    void pollHint;
    return result;
  }

  private async pollStatus(executionId: string, attempts = 8): Promise<ExecuteResult> {
    let last = await this.getStatus(executionId);
    for (let i = 0; i < attempts; i += 1) {
      if (last.status === "completed" || last.status === "failed") return last;
      await sleep(1500);
      last = await this.getStatus(executionId);
    }
    return last;
  }

  private toExecute(json: Json, label: string): ExecuteResult {
    const hash = asString(json.transactionHash);
    return {
      mode: "LIVE",
      mock: false,
      label,
      executionId: asString(json.executionId),
      status: asString(json.status),
      transactionHash: hash,
      transactionLink: asString(json.transactionLink),
      idempotentReplay: json.idempotentReplay === true,
      error: asString(json.error),
    };
  }

  private async post(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; json: Json }> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const json = (await safeJson(res)) ?? {};
    return { status: res.status, json };
  }

  private async get(
    path: string,
  ): Promise<{ status: number; json: Json; pollHint?: number }> {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const json = (await safeJson(res)) ?? {};
    const hint = res.headers.get("X-Poll-Interval-Hint");
    return { status: res.status, json, pollHint: hint ? Number(hint) : undefined };
  }
}

function transferBody(req: TransferRequest, simulate: boolean): Json {
  const body: Json = {
    chainId: String(req.chainId),
    recipientAddress: req.recipientAddress,
    amount: req.amount,
  };
  if (req.tokenAddress) body.tokenAddress = req.tokenAddress;
  if (simulate) body.simulate = true;
  return body;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function safeJson(res: Response): Promise<Json | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { error: text };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
