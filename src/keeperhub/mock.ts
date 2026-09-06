import { randomUUID } from "node:crypto";
import type { ExecuteResult, KeeperHubExecutor, SimulateResult, TransferRequest } from "./types.js";

const MOCK_LABEL =
  "MOCK — KEEPERHUB_API_KEY unset. Full CHP flow ran; nothing was broadcast. No transaction hash is invented.";

export class MockKeeperHub implements KeeperHubExecutor {
  readonly mode = "MOCK" as const;

  async simulateTransfer(req: TransferRequest): Promise<SimulateResult> {
    return {
      success: true,
      status: "simulated",
      from: "0xmockorgwallet",
      to: req.recipientAddress,
      value: req.amount,
      gasEstimate: "21000",
      simulatedReturnValue: null,
      wouldRevert: false,
      mode: "MOCK",
    };
  }

  async executeTransfer(req: TransferRequest): Promise<ExecuteResult> {
    return {
      mode: "MOCK",
      mock: true,
      label: MOCK_LABEL,
      executionId: `mock_exec_${randomUUID()}`,
      status: "mock_recorded",
      // Intentionally omitted: transactionHash / transactionLink
    };
  }

  async getStatus(executionId: string): Promise<ExecuteResult> {
    return {
      mode: "MOCK",
      mock: true,
      label: MOCK_LABEL,
      executionId,
      status: "mock_recorded",
    };
  }
}
