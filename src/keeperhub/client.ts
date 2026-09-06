import type { AppConfig } from "../lib/config.js";
import { LiveKeeperHub } from "./live.js";
import { MockKeeperHub } from "./mock.js";
import type { KeeperHubExecutor } from "./types.js";

export function createKeeperHub(config: AppConfig): KeeperHubExecutor {
  if (config.keeperhubApiKey) {
    return new LiveKeeperHub(config.keeperhubApiKey, config.apiBase);
  }
  return new MockKeeperHub();
}
