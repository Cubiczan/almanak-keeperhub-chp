/** Almanak uses chain name strings; KeeperHub uses numeric chain ids. */

export const CHAIN_IDS = {
  ethereum: 1,
  sepolia: 11_155_111,
  base: 8453,
  "base-sepolia": 84532,
  arbitrum: 42_161,
  optimism: 10,
  polygon: 137,
} as const;

export type AlmanakChainName = keyof typeof CHAIN_IDS;

const ID_TO_NAME = new Map<number, AlmanakChainName>(
  (Object.entries(CHAIN_IDS) as [AlmanakChainName, number][]).map(([name, id]) => [id, name]),
);

const TESTNET_REMAP: Partial<Record<AlmanakChainName, number>> = {
  base: CHAIN_IDS["base-sepolia"],
  ethereum: CHAIN_IDS.sepolia,
};

export function parseChainRef(value: string | number): { id?: number; name?: string; raw: string } {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { id: value, name: ID_TO_NAME.get(value), raw: String(value) };
  }
  const raw = String(value).trim().toLowerCase();
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    return { id, name: ID_TO_NAME.get(id), raw };
  }
  const id = CHAIN_IDS[raw as AlmanakChainName];
  return { id, name: raw, raw };
}

/**
 * Resolve an Almanak `chain=` field to a KeeperHub numeric chain id.
 * When the target env chain is a testnet, mainnet Almanak names remap
 * (base → 84532, ethereum → 11155111) so a faithful `Intent.swap(..., chain="base")`
 * can settle on Base Sepolia for the hackathon demo.
 */
export function resolveChainId(
  almanakChain: string | number | undefined,
  preferredTestnetId: number,
): number | undefined {
  if (almanakChain === undefined || almanakChain === "") {
    return preferredTestnetId;
  }
  const parsed = parseChainRef(almanakChain);
  if (parsed.id === undefined) return undefined;
  const name = parsed.name as AlmanakChainName | undefined;
  const preferTestnet =
    preferredTestnetId === CHAIN_IDS["base-sepolia"] || preferredTestnetId === CHAIN_IDS.sepolia;
  if (preferTestnet && name && TESTNET_REMAP[name]) {
    return TESTNET_REMAP[name];
  }
  return parsed.id;
}

export function chainLabel(id: number): string {
  const name = ID_TO_NAME.get(id);
  return name ? `${name} (${id})` : String(id);
}

export function isTestnet(id: number): boolean {
  return id === CHAIN_IDS.sepolia || id === CHAIN_IDS["base-sepolia"];
}
