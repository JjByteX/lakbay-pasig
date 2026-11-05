#!/usr/bin/env node
// Design gate. Enforces the mechanically checkable rules in
// project-foundation/ux-ui-guidelines.md against everything under src/.
//
// It is a ratchet: scripts/design-baseline.json records how many violations
// each file already has per rule. The gate fails only when a file goes above
// its baseline (or a file with no baseline gains any), so existing code does
// not block work but nothing new can make the design worse. When you fix
// violations, run `node scripts/design-gate.mjs --update-baseline` to lock
// in the lower numbers.
//
// Usage:
//   node scripts/design-gate.mjs                    check against the baseline
//   node scripts/design-gate.mjs --update-baseline  rewrite the baseline
//   node scripts/design-gate.mjs --list             print every violation

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const BASELINE_PATH = join(ROOT, "scripts", "design-baseline.json");

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update-baseline");
const LIST = args.has("--list");

// Files that legitimately hold raw values: shadcn primitives (not hand-authored),
// the brand-colored Google logo, and the generative/map layers that compute
// colors at runtime. Everything else is checked.
const EXEMPT = [
  /^src\/components\/ui\//,
  /^src\/components\/auth\/google-button\.tsx$/,
  /^src\/components\/public\/hero-lines-background\.tsx$/,
  /^src\/components\/public\/hero-lines-animation\./,
  /^src\/lib\/map-style\.ts$/,
  /^src\/assets\//,
];

// Each rule: id, message (which guideline it comes from), and a per-line test.
const RULES = [
  {
    id: "color-literal",
    message: "Raw color literal. Use a token (hsl(var(--...)) or a Tailwind token class).",
    test: (line) =>
      /#[0-9a-fA-F]{3,8}\b/.test(line) ||
      /\brgba?\(\s*[\d.]/.test(line) ||
      /\bhsla?\(\s*\d/.test(line),
  },
  {
    id: "default-palette",
    message: "Tailwind default palette color. Use a token color (primary, muted, destructive, ...).",
    test: (line) =>
      /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/.test(
        line,
      ),
  },
  {
    id: "font-weight",
    message: "Font weight above 600. Guideline: Regular (400) and Semibold (600) only.",
    test: (line) => /\bfont-(?:bold|extrabold|black)\b|\bfont-\[[7-9]00\]/.test(line),
  },
  {
    id: "italic",
    message: "Italic in the UI. Guideline: never italic for labels or navigation.",
    test: (line) => /(?:^|[\s"'`:])italic(?=[\s"'`]|$)/.test(line),
  },
  {
    id: "emoji",
    message: "Emoji in the UI. Guideline: use an icon from the project's icon library.",
    test: (line) => /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u.test(line),
  },
  {
    id: "side-border",
    message: "Single-side colored border. Guideline: use a proper selection state.",
    test: (line) => /\bborder-[lrtb]-(?:2|3|4|8)\b|\bborder-[lr]-\[/.test(line),
  },
  {
    id: "gradient",
    message: "Gradient. Guideline: flat color on structural surfaces (photo scrims are baselined).",
    test: (line) => /\bbg-gradient-|\b(?:linear|radial|conic)-gradient\(/.test(line),
  },
  {
    id: "glow",
    message: "Glow or colored shadow. Guideline: no glow effects.",
    test: (line) =>
      /\bshadow-(?:primary|secondary|accent|destructive|ring)\b/.test(line) ||
      /\bdrop-shadow-\[/.test(line) ||
      (/\bshadow-\[[^\]]*(?:hsl|rgb|#)[^\]]*\]/.test(line) && /\b0_0_(?:[1-9]\d)/.test(line)),
  },
  {
    id: "radius-arbitrary",
    message: "Arbitrary border radius. Guideline: radius values come from tokens.",
    test: (line) => /\brounded(?:-[a-z]{1,2})?-\[/.test(line),
  },
  {
    id: "font-size-arbitrary",
    message: "Arbitrary font size. Guideline: font sizes come from tokens.",
    test: (line) => /\btext-\[\d*\.?\d+(?:px|rem|em)\]/.test(line),
  },
  {
    id: "icon-library",
    message: "Icon library other than @phosphor-icons/react.",
    test: (line) =>
      /from\s+["'](?:lucide-react|react-icons(?:\/[^"']*)?|@heroicons\/[^"']*|@radix-ui\/react-icons|@fortawesome\/[^"']*)["']/.test(
        line,
      ),
  },
  {
    id: "inline-svg",
    message: "Inline <svg>. Guideline: never hardcode icons, use the icon library.",
    test: (line) => /<svg[\s>]/.test(line),
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

// Comment-only lines are skipped: they document values, they do not render.
function isCommentLine(line) {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}

const found = []; // { file, line, rule, text }
for (const abs of walk(SRC)) {
  const file = relative(ROOT, abs).split(sep).join("/");
  if (EXEMPT.some((re) => re.test(file))) continue;
  const lines = readFileSync(abs, "utf8").split("\n");
  // index.css is the token definition file: raw values belong there.
  const isTokenFile = file === "src/index.css";
  lines.forEach((text, i) => {
    if (isCommentLine(text)) return;
    for (const rule of RULES) {
      if (isTokenFile && rule.id !== "emoji") continue;
      if (rule.test(text)) found.push({ file, line: i + 1, rule: rule.id, text: text.trim() });
    }
  });
}

const counts = {};
for (const v of found) {
  const key = `${v.file}::${v.rule}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

if (UPDATE) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Baseline written: ${Object.keys(sorted).length} entries, ${found.length} violations.`);
  process.exit(0);
}

if (LIST) {
  for (const v of found) console.log(`${v.file}:${v.line}  [${v.rule}]  ${v.text.slice(0, 110)}`);
  console.log(`\n${found.length} violations.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};
const messages = Object.fromEntries(RULES.map((r) => [r.id, r.message]));

const regressions = [];
for (const [key, count] of Object.entries(counts)) {
  const allowed = baseline[key] ?? 0;
  if (count > allowed) regressions.push({ key, count, allowed });
}

const improved = Object.entries(baseline).filter(([key, allowed]) => (counts[key] ?? 0) < allowed);

if (regressions.length === 0) {
  console.log(`Design gate passed (${found.length} baselined violations remain).`);
  if (improved.length > 0) {
    console.log(
      `${improved.length} baseline entr${improved.length === 1 ? "y is" : "ies are"} now lower. ` +
        "Run `node scripts/design-gate.mjs --update-baseline` to lock that in.",
    );
  }
  process.exit(0);
}

console.error("Design gate failed. New violations of project-foundation/ux-ui-guidelines.md:\n");
for (const { key, count, allowed } of regressions) {
  const [file, rule] = key.split("::");
  console.error(`  ${file}  [${rule}]  ${count} found, ${allowed} allowed`);
  console.error(`    ${messages[rule]}`);
  for (const v of found.filter((f) => f.file === file && f.rule === rule).slice(0, 5)) {
    console.error(`    line ${v.line}: ${v.text.slice(0, 100)}`);
  }
  console.error("");
}
console.error("Fix the new violations. If a value truly must be raw, add it as a token in src/index.css instead.");
process.exit(1);
