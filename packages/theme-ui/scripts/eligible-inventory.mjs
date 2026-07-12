/**
 * Mechanical closure gate for theme-ui migration.
 *
 * Classifies every packages/desktop-app/src/renderer .tsx export as:
 *   - migrated: thin re-export / adapter to @vetta/theme-ui
 *   - blocked: jotai / IPC / router (data-layer; not theme-ui eligible as-is)
 *   - host-ui: Dialog/Drawer/Popover/radix (unlock via @vetta/ui)
 *   - non-goal: onboarding / pet / quickpanel / plugins private
 *   - eligible: pure or soft:i18n/cn presentation — must be migrated OR listed in deferrals.json
 *
 * Parent/container deferral does NOT cover child files.
 *
 * Exit 1 if any eligible path is neither migrated nor deferred.
 *
 * Usage:
 *   bun packages/theme-ui/scripts/eligible-inventory.mjs
 *   bun packages/theme-ui/scripts/eligible-inventory.mjs --json > report.json
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rendererRoot = path.join(repoRoot, "packages/desktop-app/src/renderer");
const deferralsPath = path.join(repoRoot, "docs/theme/ui/deferrals.json");
const wantJson = process.argv.includes("--json");

function walk(dir, acc = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === "node_modules" || e.name === "__tests__" || e.name === "test") continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(e.name) && !e.name.endsWith(".test.tsx") && !e.name.endsWith(".d.tsx"))
			acc.push(p);
	}
	return acc;
}

function toRel(abs) {
	return path.relative(repoRoot, abs).replace(/\\/g, "/");
}

function loadDeferrals() {
	if (!existsSync(deferralsPath)) return {};
	const raw = JSON.parse(readFileSync(deferralsPath, "utf8"));
	// Accept { "path": { unlock } } or { "path": "unlock string" }
	const out = {};
	for (const [k, v] of Object.entries(raw)) {
		if (typeof v === "string") out[k] = { status: "deferred", unlock: v };
		else if (v && typeof v === "object") out[k] = { status: "deferred", unlock: v.unlock ?? v.reason ?? "" };
	}
	return out;
}

function classify(abs, text) {
	const rel = toRel(abs);
	const lines = text.split("\n").length;

	if (/\/onboarding\/|\/pet\/|\/quickpanel\/|\/plugins\//.test(rel)) {
		return { status: "non-goal", rel, lines };
	}

	const hasTheme = /@vetta\/theme-ui/.test(text);
	const hasAtom = /useAtom|from ["']jotai|store\/atoms|Atom\b/.test(text);
	const hasIpc = /window\.vetta|@preload\//.test(text);
	const hasRouter = /@tanstack\/react-router|useNavigate|useParams|useMatches|useRouter/.test(text);
	const hasI18n = /react-i18next|useTranslation/.test(text);
	const hasHostUi =
		/components\/ui\/(dialog|drawer|popover|button)/i.test(text) || /@radix-ui|from ["']radix-ui/.test(text);
	const hasSharedCnOnly = /from ["']@shared\/lib\/utils["']/.test(text) && !hasAtom && !hasIpc && !hasRouter;
	const hasExport = /export function|export const \w+\s*=|export class|export default function/.test(text);

	// Thin re-export / adapter to theme-ui
	const isThinReexport =
		hasTheme &&
		lines <= 35 &&
		!hasAtom &&
		!hasIpc &&
		!hasRouter &&
		(/^export \{/.test(text.trim()) || /from ["']@vetta\/theme-ui/.test(text));
	const isAdapter =
		hasTheme &&
		lines <= 55 &&
		!hasAtom &&
		!hasIpc &&
		!hasRouter &&
		(hasI18n || /adapter|useCodeClipboard|ACHIEVEMENT_/.test(text));

	if (isThinReexport || isAdapter) {
		return { status: "migrated", rel, lines, hasI18n };
	}

	if (!hasExport) {
		return { status: "skip", rel, lines, reason: "no-component-export" };
	}

	// types-only / non-UI dirs
	if (/\/hooks\/|\/store\/|\/atoms\/|\/services\/|\/lib\/|\/utils\/|types\.ts$/.test(rel)) {
		return { status: "skip", rel, lines, reason: "non-ui-path" };
	}

	if (hasAtom || hasIpc || hasRouter) {
		return { status: "blocked", rel, lines, tags: { hasAtom, hasIpc, hasRouter } };
	}

	if (hasHostUi) {
		return { status: "host-ui", rel, lines, unlock: "Move Dialog/Drawer/Popover/Button into @vetta/ui" };
	}

	// eligible: pure presentation, or soft:i18n / soft:cn (utils only)
	const soft = [];
	if (hasI18n) soft.push("i18n");
	if (hasSharedCnOnly) soft.push("cn");
	return {
		status: "eligible",
		rel,
		lines,
		soft: soft.join(",") || "pure",
	};
}

const deferrals = loadDeferrals();
const files = walk(rendererRoot);
const buckets = {
	migrated: [],
	eligible: [],
	deferred: [],
	blocked: [],
	"host-ui": [],
	"non-goal": [],
	skip: [],
};

for (const f of files) {
	const text = readFileSync(f, "utf8");
	const c = classify(f, text);
	if (c.status === "eligible") {
		if (deferrals[c.rel]) {
			buckets.deferred.push({ ...c, unlock: deferrals[c.rel].unlock });
		} else {
			buckets.eligible.push(c);
		}
		continue;
	}
	if (c.status === "host-ui") {
		// host-ui can be deferred too
		if (deferrals[c.rel]) {
			buckets.deferred.push({ ...c, unlock: deferrals[c.rel].unlock });
		} else {
			buckets["host-ui"].push(c);
		}
		continue;
	}
	buckets[c.status]?.push(c);
}

// Orphan deferrals (already migrated) are OK — ignore
const report = {
	summary: {
		migrated: buckets.migrated.length,
		eligible_open: buckets.eligible.length,
		deferred: buckets.deferred.length,
		blocked: buckets.blocked.length,
		host_ui_open: buckets["host-ui"].length,
		non_goal: buckets["non-goal"].length,
		skip: buckets.skip.length,
	},
	eligible: buckets.eligible.map((e) => ({ path: e.rel, soft: e.soft, lines: e.lines })),
	host_ui_open: buckets["host-ui"].map((e) => ({ path: e.rel, lines: e.lines })),
	deferred: buckets.deferred.map((e) => ({ path: e.rel, unlock: e.unlock })),
};

if (wantJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log("=== theme-ui eligible inventory ===");
	console.log(JSON.stringify(report.summary, null, 2));
	console.log("\n--- ELIGIBLE OPEN (must migrate or add to deferrals.json) ---");
	for (const e of report.eligible) {
		console.log(`eligible\t${e.soft}\t${e.lines}\t${e.path}`);
	}
	console.log("\n--- HOST-UI OPEN (must migrate after @vetta/ui or defer) ---");
	for (const e of report.host_ui_open) {
		console.log(`host-ui\t${e.lines}\t${e.path}`);
	}
	console.log(`\nmigrated=${report.summary.migrated} deferred=${report.summary.deferred}`);
}

const openCount = report.summary.eligible_open + report.summary.host_ui_open;
if (openCount > 0) {
	console.error(
		`\neligible-inventory FAILED: ${report.summary.eligible_open} eligible + ${report.summary.host_ui_open} host-ui open (not migrated, not in docs/theme/ui/deferrals.json)`,
	);
	process.exit(1);
}

console.error("\neligible-inventory OK: every eligible/host-ui path is migrated or deferred");
process.exit(0);
