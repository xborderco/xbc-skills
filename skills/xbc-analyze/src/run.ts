import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
import Stripe from "stripe";

// xbc-analyze action runner (pattern borrowed from XBC's internal manual-test
// tooling). The Stripe key lives ONLY in the gitignored .env next to
// package.json — never passed as an argument, never printed, never shown to
// the agent. Runs one read-only action file and prints its JSON result.
//
//   npx tsx src/run.ts actions/<action>.ts [--key=value ...]
//
// Only RESTRICTED keys (rk_...) are accepted. Secret keys (sk_...) are
// refused outright — see SKILL.md "Create your restricted key".

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadDotenv({ path: join(SKILL_ROOT, ".env"), quiet: true });

const [, , actionPath, ...rest] = process.argv;

if (!actionPath) {
  fail("usage: npx tsx src/run.ts actions/<action>.ts [--key=value ...]");
}

const resolvedAction = resolve(SKILL_ROOT, actionPath);
if (!existsSync(resolvedAction)) {
  fail(`action file not found: ${resolvedAction}`);
}
if (!resolvedAction.startsWith(join(SKILL_ROOT, "actions"))) {
  fail("only files inside actions/ can be run by this runner");
}

const apiKey = process.env.STRIPE_API_KEY;
if (!apiKey) {
  fail(
    `STRIPE_API_KEY not set. Copy .env.example to .env in ${SKILL_ROOT} and paste your restricted key (rk_...).`
  );
}
if (!apiKey.startsWith("rk_")) {
  fail(
    "Refusing to run: STRIPE_API_KEY is not a RESTRICTED key (must start with rk_test_ or rk_live_).\n" +
      "Never use your secret key (sk_...) with this tool. Create a read-only restricted key instead —\n" +
      'see "Create your restricted key" in SKILL.md, then replace the value in .env.'
  );
}

const params: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (!arg.startsWith("--")) {
    fail(`unexpected arg: ${arg} (use --key=value)`);
  }
  const body = arg.slice(2);
  const eq = body.indexOf("=");
  if (eq >= 0) {
    params[body.slice(0, eq)] = body.slice(eq + 1);
  } else {
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      fail(`missing value for --${body}`);
    }
    params[body] = next;
    i++;
  }
}

const stripe = new Stripe(apiKey, { maxNetworkRetries: 2 });

type StripeAction = (
  stripe: Stripe,
  params: Record<string, string>
) => Promise<unknown>;

const mod = (await import(pathToFileURL(resolvedAction).href)) as {
  default?: StripeAction;
};
if (typeof mod.default !== "function") {
  fail(`action file must export a default function: ${actionPath}`);
}

try {
  const result = await mod.default(stripe, params);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  fail(`stripe error: ${(err as Error).message}`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
