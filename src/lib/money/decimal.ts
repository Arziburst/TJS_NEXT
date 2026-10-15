// Exact decimal numbers for rates: a rate never passes through a float once parsed.
// value = units / 10^scale. The ES2017 target has no bigint literals, hence BigInt(…).
export type Decimal = { units: bigint; scale: number };

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

export function parseDecimal(text: string): Decimal | null {
  const match = DECIMAL_PATTERN.exec(text.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  return { units: BigInt(match[1] + fraction), scale: fraction.length };
}

export function formatDecimal({ units, scale }: Decimal): string {
  const negative = units < BigInt(0);
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

export function pow10(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

// numerator / denominator for non-negative operands, rounded half up
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (BigInt(2) * numerator + denominator) / (BigInt(2) * denominator);
}

// numerator / denominator for non-negative operands, rounded up
export function divideUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}

// a / b rounded half up to `scale` places
export function divideDecimals(a: Decimal, b: Decimal, scale: number): Decimal {
  if (b.units === BigInt(0)) throw new RangeError("division by zero");
  const numerator = a.units * pow10(b.scale + scale);
  const denominator = b.units * pow10(a.scale);
  return { units: divideHalfUp(numerator, denominator), scale };
}
