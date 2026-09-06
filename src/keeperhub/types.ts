/**
 * KeeperHub Direct Execution shapes.
 * REST: https://docs.keeperhub.com/api/direct-execution
 * MCP:  https://docs.keeperhub.com/ai-tools/mcp-server
 * MCP endpoint: https://app.keeperhub.com/mcp  (Bearer kh_...)
 */

export type SimulateResult = {
  success: boolean;
  status: "simulated";
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: unknown;
  wouldRevert: boolean;
  failureKind?: string;
  revertReason?: string;
  error?: string;
  mode: "LIVE" | "MOCK";
};

export type ExecuteResult = {
  mode: "LIVE" | "MOCK";
  mock: boolean;
  label: string;
  executionId?: string;
  status?: string;
  /** Present only on a live broadcast. MOCK never fabricates a hash. */
  transactionHash?: string;
  transactionLink?: string;
  idempotentReplay?: boolean;
  error?: string;
};

export type TransferRequest = {
  chainId: number;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
  taskId: string;
};

export interface KeeperHubExecutor {
  readonly mode: "LIVE" | "MOCK";
  simulateTransfer(req: TransferRequest): Promise<SimulateResult>;
  executeTransfer(req: TransferRequest): Promise<ExecuteResult>;
  getStatus(executionId: string): Promise<ExecuteResult>;
}
