// Shared helpers for actions. Underscore prefix = not a runnable action.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const RAW_DIR = join(SKILL_ROOT, "xbc-analysis", "raw");

export function required(
  params: Record<string, string>,
  key: string
): string {
  const value = params[key];
  if (!value) {
    console.error(`missing required --${key}`);
    process.exit(1);
  }
  return value;
}

/** Write a raw dataset to xbc-analysis/raw/<name> and return the path.
 *  Every raw file is stamped with the key mode so downstream computes and
 *  reports can flag test-mode data (simulated fees, US-issued test cards). */
export function writeRaw(name: string, data: unknown): string {
  mkdirSync(RAW_DIR, { recursive: true });
  const path = join(RAW_DIR, name);
  const key_mode = process.env.STRIPE_API_KEY?.startsWith("rk_live_")
    ? "live"
    : "test";
  const stamped =
    data && typeof data === "object" && !Array.isArray(data)
      ? { _meta: { key_mode }, ...data }
      : data;
  writeFileSync(path, JSON.stringify(stamped, null, 2));
  return path;
}

/** Default fetch window: trailing 12 months, overridable via --from/--to (YYYY-MM-DD). */
export function fetchWindow(params: Record<string, string>): {
  from: Date;
  to: Date;
  created: { gte: number; lte: number };
} {
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from
    ? new Date(params.from)
    : new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    console.error("invalid --from/--to date (use YYYY-MM-DD)");
    process.exit(1);
  }
  return {
    from,
    to,
    created: {
      gte: Math.floor(from.getTime() / 1000),
      lte: Math.floor(to.getTime() / 1000),
    },
  };
}
