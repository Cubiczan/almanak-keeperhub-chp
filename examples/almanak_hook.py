"""How a live Almanak strategy container hands a decide() result to KeeperGate.

Almanak keeps secrets in the gateway sidecar. The strategy process stays
secretless and only serializes the public intent vocabulary.

    pipx install almanak
    # then, in your strategy:

    intent = self.decide(market)
    if intent is not None:
        post_to_keepergate(Intent.serialize(intent))
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any


def post_to_keepergate(serialized_intent: dict[str, Any], url: str = "http://127.0.0.1:8787/propose") -> None:
    payload = json.dumps(serialized_intent).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


# Example payload matching src/almanak/intents.ts serialize():
EXAMPLE = {
    "intent_type": "swap",
    "from_token": "USDC",
    "to_token": "ETH",
    "amount_usd": "25",
    "protocol": "uniswap_v3",
    "chain": "base",
    "max_slippage": "0.005",
    "confidence": "0.91",
    "intent_id": "00000000-0000-0000-0000-000000000001",
    "created_at": "2026-09-06T00:00:00Z",
}
