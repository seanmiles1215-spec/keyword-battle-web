const DECIMAL = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/u;

function parts(value: string) {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  return { whole: value.split(".")[0], fraction: match[1] ?? "" };
}

export function formatFixed(value: string | null, digits = 2) {
  if (value === null || !Number.isSafeInteger(digits) || digits < 0) return null;
  const parsed = parts(value);
  if (!parsed) return null;
  const padded = parsed.fraction.padEnd(digits + 1, "0");
  const scale = 10n ** BigInt(digits);
  let units = (BigInt(parsed.whole) * scale) + BigInt((padded.slice(0, digits) || "0"));
  if (padded[digits] >= "5") units += 1n;
  const whole = units / scale;
  if (digits === 0) return whole.toString();
  return `${whole}.${(units % scale).toString().padStart(digits, "0")}`;
}

export function formatPercent(value: string | null) {
  if (value === null) return null;
  const parsed = parts(value);
  if (!parsed) return null;
  const scaled = (BigInt(parsed.whole) * 100_000_000n)
    + BigInt(parsed.fraction.padEnd(8, "0").slice(0, 8));
  const hundredths = (scaled + 5_000n) / 10_000n;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}

function sixUnits(value: string | null) {
  if (value === null) return null;
  const parsed = parts(value);
  if (!parsed) return null;
  return (BigInt(parsed.whole) * 1_000_000n) + BigInt(parsed.fraction.padEnd(6, "0").slice(0, 6));
}

function ratioUnits(value: string | null) {
  if (value === null) return null;
  const parsed = parts(value);
  if (!parsed || parsed.fraction.length > 8) return null;
  return (BigInt(parsed.whole) * 100_000_000n) + BigInt(parsed.fraction.padEnd(8, "0"));
}

function roundedQuotient(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return null;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + (denominator / 2n)) / denominator;
  return negative ? -rounded : rounded;
}

function hundredths(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function percentagePointChange(before: string | null, after: string | null) {
  const beforeUnits = ratioUnits(before); const afterUnits = ratioUnits(after);
  if (beforeUnits === null || afterUnits === null) return null;
  const result = roundedQuotient(afterUnits - beforeUnits, 10_000n);
  return result === null ? null : hundredths(result);
}

export function improvementPercent(before: string | null, after: string | null) {
  const beforeUnits = ratioUnits(before); const afterUnits = ratioUnits(after);
  if (beforeUnits === null || afterUnits === null || beforeUnits <= 0n) return null;
  const result = roundedQuotient((beforeUnits - afterUnits) * 10_000n, beforeUnits);
  return result === null ? null : hundredths(result);
}

export function compareFixed(left: string | null, right: string | null) {
  const a = sixUnits(left); const b = sixUnits(right);
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function positiveFixed(value: string | null) {
  const units = sixUnits(value);
  return units !== null && units > 0n;
}
