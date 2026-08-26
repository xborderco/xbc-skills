import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Import a Stripe Dashboard payments export instead of connecting a key.
// Writes the same xbc-analysis/raw/ files the fetch actions write, so every
// compute script downstream runs unchanged.
//
//   npx tsx src/import-csv.ts --file="/path/to/unified_payments.csv" [--home=IE]
//
// No Stripe key, no network, no npm dependency beyond tsx. The CSV never leaves
// this machine. A CSV cannot carry customer tax IDs, tax registrations,
// subscriptions or the product catalogue, so several report sections are
// unavailable on this path — that is recorded in the output, not hidden.

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(SKILL_ROOT, "xbc-analysis", "raw");

const params: Record<string, string> = {};
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) fail(`unexpected argument: ${arg} (use --key=value)`);
  const body = arg.slice(2);
  const eq = body.indexOf("=");
  if (eq < 0) fail(`missing value for --${body}`);
  params[body.slice(0, eq)] = body.slice(eq + 1);
}

const file = params.file;
if (!file) {
  fail(
    'missing --file\n\n  npx tsx src/import-csv.ts --file="/path/to/unified_payments.csv" --home=IE'
  );
}
const csvPath = resolve(file.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
if (!existsSync(csvPath)) fail(`file not found: ${csvPath}`);

const home = params.home ? params.home.toUpperCase() : null;

// --- CSV parsing (RFC 4180: quoted fields may contain commas and newlines) ---

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Strip a UTF-8 BOM — Stripe's export carries one and it corrupts the first header.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const parsed = parseCsv(readFileSync(csvPath, "utf8"));
if (parsed.length < 2) fail("the CSV has no data rows");
const header = parsed[0].map((h) => h.trim());
const index = new Map(header.map((h, i) => [h, i]));

// Columns the analysis cannot run without. Named exactly as Stripe's export
// writes them, so the error tells the user what to re-tick in the dialog.
const REQUIRED = [
  "id",
  "Created date (UTC)",
  "Amount",
  "Amount Refunded",
  "Currency",
  "Status",
  "Card Address Country",
  "Card Issue Country",
];
const missing = REQUIRED.filter((c) => !index.has(c));
if (missing.length > 0) {
  fail(
    `The export is missing ${missing.length} column(s) the analysis needs:\n` +
      missing.map((m) => `  - ${m}`).join("\n") +
      "\n\nRe-export from the Stripe Dashboard and set Columns to \"All columns\"," +
      '\nnot "Default". Transactions -> Export -> Columns -> All columns.' +
      "\n\nStripe's own guide to this export:" +
      "\n  https://support.stripe.com/questions/exporting-payment-data"
  );
}

const get = (row: string[], col: string): string =>
  (index.has(col) ? row[index.get(col) as number] ?? "" : "").trim();

// --- rows -> ChargeRecord ------------------------------------------------

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
// The CSV writes major units ("8.00"); ChargeRecord holds Stripe minor units.
function toMinor(major: string, currency: string): number {
  const n = Number.parseFloat(major || "0");
  if (!Number.isFinite(n)) return 0;
  return ZERO_DECIMAL.has(currency) ? Math.round(n) : Math.round(n * 100);
}

// Only rows that moved money. A cancelled or failed attempt is not revenue.
const MONEY_STATUSES = new Set(["paid", "refunded"]);

const charges = [];
let skipped = 0;
let earliest: number | null = null;
let latest: number | null = null;
let checkoutSessions = 0;
let fromPaymentLink = 0;
const paymentLinkIds = new Set<string>();

for (const row of parsed.slice(1)) {
  if (row.length < header.length / 2) continue; // blank/ragged trailing line
  const status = get(row, "Status").toLowerCase();
  if (!MONEY_STATUSES.has(status)) {
    skipped += 1;
    continue;
  }
  const currency = get(row, "Currency").toUpperCase();
  // "2026-08-26 11:31:54" is UTC per the column name.
  const createdRaw = get(row, "Created date (UTC)").replace(" ", "T");
  const created = new Date(`${createdRaw}Z`);
  if (Number.isNaN(created.getTime())) {
    skipped += 1;
    continue;
  }
  const t = created.getTime();
  earliest = earliest === null ? t : Math.min(earliest, t);
  latest = latest === null ? t : Math.max(latest, t);

  charges.push({
    id: get(row, "id"),
    created: created.toISOString(),
    amount: toMinor(get(row, "Amount"), currency),
    amount_refunded: toMinor(get(row, "Amount Refunded"), currency),
    currency,
    refunded: status === "refunded",
    billing_country: get(row, "Card Address Country") || null,
    billing_state: get(row, "Card Address State") || null,
    card_country: get(row, "Card Issue Country") || null,
    customer: get(row, "Customer ID") || null,
    invoice: get(row, "Invoice ID") || null,
  });

  if (get(row, "Checkout Session ID")) checkoutSessions += 1;
  const link = get(row, "Payment Link ID");
  if (link) {
    fromPaymentLink += 1;
    paymentLinkIds.add(link);
  }
}

if (charges.length === 0) {
  fail(
    'No paid rows found. Check that the export covers a period with sales, and that\nthe Status column is included. Rows with status "canceled" or "failed" are ignored.' +
      "\n\nStripe's own guide to this export:" +
      "\n  https://support.stripe.com/questions/exporting-payment-data"
  );
}

const window = {
  from: new Date(earliest as number).toISOString(),
  to: new Date(latest as number).toISOString(),
};
const spanDays = Math.round(
  ((latest as number) - (earliest as number)) / (24 * 60 * 60 * 1000)
);

mkdirSync(RAW_DIR, { recursive: true });
const write = (name: string, data: object) => {
  writeFileSync(
    join(RAW_DIR, name),
    JSON.stringify({ _meta: { key_mode: "live", source: "csv_import" }, ...data }, null, 2)
  );
};

write("charges.json", { window, charges });
// A CSV carries no customer records. Country resolution falls back to the
// billing and card-issuer columns, which the export does carry.
write("customers.json", { tax_ids_expanded: false, customers: [] });
// Registrations are UNKNOWN here, not absent. Empty would make every crossed
// jurisdiction look unregistered, including ones the merchant already handles.
write("tax-registrations.json", { registrations_known: false, registrations: [] });
write("tax-settings.json", {
  head_office_country: home,
  default_tax_behavior: null,
  status: null,
});
write("checkout-config.json", {
  window,
  readable: true,
  checkout_sessions: checkoutSessions,
  sessions_by_mode: {},
  // A CSV export has no ui_mode column, so hosted and embedded cannot be told
  // apart. Reported as unknown rather than guessed.
  sessions_by_ui_mode: { unknown: Math.max(0, checkoutSessions - fromPaymentLink) },
  sessions_from_payment_link: fromPaymentLink,
  sessions_with_invoice_creation: 0,
  payment_links_defined: paymentLinkIds.size || null,
});

const unavailable = [
  "Your invoices and business customers — needs customer tax IDs, which a payments export does not carry.",
  "Recurring revenue (MRR/ARR) — needs the subscription list.",
  "Product catalogue and tax codes — needs the product list.",
  "Existing tax registrations — a jurisdiction you are already registered for will still be flagged.",
];
const warnings: string[] = [];
if (!home) {
  warnings.push(
    "No --home country given. The EU test needs the country your business is established in, and without it domestic sales cannot be excluded. Re-run with --home=XX."
  );
}
if (spanDays < 60) {
  warnings.push(
    `The export covers ${spanDays} days. Registration thresholds are annual, so a window this short cannot test them — most jurisdictions will report "not enough data". Export at least 12 months.`
  );
} else if (spanDays < 330) {
  warnings.push(
    `The export covers ${spanDays} days, less than a full year. Jurisdictions measuring over a longer window will report "not enough data" rather than a result.`
  );
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      source: csvPath,
      source_documentation:
        "https://support.stripe.com/questions/exporting-payment-data",
      charges_imported: charges.length,
      rows_skipped_not_paid: skipped,
      window,
      window_days: spanDays,
      head_office_country: home,
      sections_unavailable_on_this_path: unavailable,
      ...(warnings.length > 0 && { warnings }),
    },
    null,
    2
  )
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
