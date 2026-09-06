/** Decimal-string helpers. Avoid binary floats for USD and token amounts. */

const DEC = /^\d+(\.\d+)?$/;

export function assertDecimal(value: string, label: string): string {
  const trimmed = value.trim();
  if (!DEC.test(trimmed)) {
    throw new Error(`${label} must be a non-negative decimal string, got ${value}`);
  }
  return canonicalizeAmount(trimmed);
}

export function canonicalizeAmount(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+") || trimmed.startsWith("-")) {
    throw new Error(`amount must not carry a sign: ${value}`);
  }
  if (!DEC.test(trimmed)) {
    throw new Error(`invalid amount: ${value}`);
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = (wholeRaw ?? "0").replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.replace(/0+$/, "");
  return frac.length === 0 ? whole : `${whole}.${frac}`;
}

export function compareDecimal(a: string, b: string): number {
  const left = expand(a);
  const right = expand(b);
  const scale = Math.max(left.scale, right.scale);
  const leftN = BigInt(left.digits.padEnd(left.digits.length + (scale - left.scale), "0"));
  const rightN = BigInt(right.digits.padEnd(right.digits.length + (scale - right.scale), "0"));
  if (leftN === rightN) return 0;
  return leftN < rightN ? -1 : 1;
}

export function subDecimal(a: string, b: string): string {
  const left = expand(a);
  const right = expand(b);
  const scale = Math.max(left.scale, right.scale);
  const leftN = BigInt(left.digits.padEnd(left.digits.length + (scale - left.scale), "0"));
  const rightN = BigInt(right.digits.padEnd(right.digits.length + (scale - right.scale), "0"));
  if (leftN < rightN) {
    throw new Error(`subDecimal underflow: ${a} - ${b}`);
  }
  const diff = (leftN - rightN).toString();
  if (scale === 0) return canonicalizeAmount(diff);
  const padded = diff.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const frac = padded.slice(padded.length - scale);
  return canonicalizeAmount(`${whole}.${frac}`);
}

export function addDecimal(a: string, b: string): string {
  const left = expand(a);
  const right = expand(b);
  const scale = Math.max(left.scale, right.scale);
  const leftN = BigInt(left.digits.padEnd(left.digits.length + (scale - left.scale), "0"));
  const rightN = BigInt(right.digits.padEnd(right.digits.length + (scale - right.scale), "0"));
  const sum = (leftN + rightN).toString();
  if (scale === 0) return canonicalizeAmount(sum);
  const padded = sum.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const frac = padded.slice(padded.length - scale);
  return canonicalizeAmount(`${whole}.${frac}`);
}

export function mulDecimal(a: string, b: string): string {
  const left = expand(a);
  const right = expand(b);
  const scale = left.scale + right.scale;
  const product = (BigInt(left.digits) * BigInt(right.digits)).toString();
  if (scale === 0) return canonicalizeAmount(product);
  const padded = product.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const frac = padded.slice(padded.length - scale);
  return canonicalizeAmount(`${whole}.${frac}`);
}

export function divDecimal(a: string, b: string, places = 8): string {
  const left = expand(a);
  const right = expand(b);
  if (right.digits === "0") throw new Error("division by zero");
  const extra = places + 4;
  const numerator = BigInt(left.digits) * 10n ** BigInt(right.scale + extra);
  const denominator = BigInt(right.digits) * 10n ** BigInt(left.scale);
  const quotient = numerator / denominator;
  const raw = quotient.toString().padStart(extra + 1, "0");
  const whole = raw.slice(0, raw.length - extra);
  const frac = raw.slice(raw.length - extra, raw.length - extra + places);
  return canonicalizeAmount(`${whole}.${frac}`);
}

function expand(value: string): { digits: string; scale: number } {
  const canonical = canonicalizeAmount(value);
  const [whole, frac = ""] = canonical.split(".");
  return { digits: `${whole}${frac}` || "0", scale: frac.length };
}
