/**
 * Must-split + migration closure gate (strict backlog clear).
 *
 * Exit 1 unless:
 *   must_split_open == 0
 *   must_migrate_open == 0
 *   must_host_hold_open == 0
 *   no bad deferrals (split-wait forbidden)
 *
 * deferrals.json kinds: permanent_desktop | host_primitive_hold | non_goal
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rendererRoot = path.join(repoRoot, "packages/desktop-app/src/renderer");
const deferralsPath = path.join(repoRoot, "docs/theme/ui/deferrals.json");
const wantJson = process.argv.includes("--json");

const FORBIDDEN_SPLIT_WAIT =
	/split model|pending split|continue slice|尚未拆|等拆|must.?split|not required for theme|presentation leaf pending|composition still coupled|data tree|slice-then-migrate|unlock after|unsplit|Eligible presentation/i;

function walk(dir, acc = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === "node_modules" || e.name === "__tests__" || e.name === "test") continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(e.name) && !e.name.endsWith(".test.tsx")) acc.push(p);
	}
	return acc;
}

function toRel(abs) {
	return path.relative(repoRoot, abs).replace(/\\/g, "/");
}

function loadDeferrals() {
	if (!existsSync(deferralsPath)) return {};
	const raw = JSON.parse(readFileSync(deferralsPath, "utf8"));
	const out = {};
	for (const [k, v] of Object.entries(raw)) {
		if (typeof v === "string") out[k] = { kind: "permanent_desktop", reason: v };
		else if (v && typeof v === "object") {
			out[k] = {
				kind: v.kind ?? "legacy",
				reason: v.reason ?? v.unlock ?? "",
			};
		}
	}
	return out;
}

function hasJsx(text) {
	return /return\s*\([\s\S]*</.test(text) || /return\s+</.test(text);
}

function siblingViewExists(abs) {
	const dir = path.dirname(abs);
	const base = path.basename(abs, ".tsx");
	// Foo.tsx -> FooView.tsx or views/FooView.tsx
	const candidates = [
		path.join(dir, `${base}View.tsx`),
		path.join(dir, "views", `${base}View.tsx`),
		path.join(dir, `${base.replace(/Page$/, "")}PageView.tsx`),
	];
	// LoginDialog -> LoginDialogView
	if (existsSync(path.join(dir, `${base}View.tsx`))) return true;
	for (const c of candidates) if (existsSync(c)) return true;
	// Directory co-located *View used in file
	return false;
}

function classify(abs, text, deferrals) {
	const rel = toRel(abs);
	const lines = text.split("\n").length;

	if (/\/onboarding\/|\/pet\/|\/quickpanel\//.test(rel)) {
		return { status: "non_goal", rel, lines };
	}

	const hasTheme = /@vetta\/theme-ui/.test(text);
	const hasAtom = /useAtom|from ["']jotai|store\/atoms/.test(text);
	const hasIpc = /window\.vetta/.test(text);
	const hasRouter = /@tanstack\/react-router|useNavigate|useParams|useMatches\b/.test(text);
	const hasI18n = /react-i18next|useTranslation/.test(text);
	const hasHostUi =
		/components\/ui\/(dialog|drawer|popover|button)/i.test(text) || /from ["']radix-ui|@radix-ui/.test(text);
	const hasExport = /export function|export const \w+\s*=|export class|export default function/.test(text);
	const jsx = hasJsx(text);
	const dataHeavy = hasAtom || hasIpc || hasRouter;
	const d = deferrals[rel];

	const isThinReexport =
		hasTheme && lines <= 45 && !dataHeavy && (/^export \{/.test(text.trim()) || /from ["']@vetta\/theme-ui/.test(text));
	const isAdapter =
		hasTheme &&
		lines <= 70 &&
		!dataHeavy &&
		(hasI18n || /ACHIEVEMENT_|useCodeClipboard|as Theme|formatResetCountdown/.test(text));
	if (isThinReexport || isAdapter) return { status: "migrated", rel, lines };

	if (!hasExport) return { status: "skip", rel, lines };

	if (/\/hooks\//.test(rel) || /use[A-Z]\w+Model\.tsx?$/.test(path.basename(abs))) {
		return { status: "permanent_desktop", rel, lines, reason: "model-hook" };
	}
	if (/\/store\/|\/services\//.test(rel) && !jsx) {
		return { status: "permanent_desktop", rel, lines, reason: "data-module" };
	}

	const callsModel = /use[A-Z][A-Za-z0-9]*Model\s*\(/.test(text);
	const usesView =
		/<[A-Z][A-Za-z0-9]*(View|Frame)\b/.test(text) ||
		/useTheme(Region|Component)/.test(text) ||
		(siblingViewExists(abs) && /View\b/.test(text));

	// Thin connected container: only wires model hook -> *View (data lives in hook file)
	if (jsx && callsModel && usesView && lines <= 50) {
		const classCount = (text.match(/className=/g) || []).length;
		if (classCount <= 6) {
			return { status: "split_ok", rel, lines, reason: "thin-model-container" };
		}
	}

	// Container already split: has model + View (or theme region) even with local atoms
	if (jsx && dataHeavy && usesView && (callsModel || siblingViewExists(abs))) {
		const classCount = (text.match(/className=/g) || []).length;
		if (classCount <= 15 || lines <= 120 || siblingViewExists(abs)) {
			return { status: "split_ok", rel, lines, reason: "container-with-view" };
		}
	}

	// Props view without data
	if (jsx && !dataHeavy) {
		if (hasHostUi) {
			if (d?.kind === "host_primitive_hold") {
				return { status: "host_primitive_hold", rel, lines, reason: d.reason };
			}
			if (d?.kind === "permanent_desktop") {
				return { status: "permanent_desktop", rel, lines, reason: d.reason };
			}
			// Already props-only but uses host Dialog — must list as host_primitive_hold
			return { status: "must_host_hold", rel, lines };
		}
		if (d?.kind === "permanent_desktop" || d?.kind === "non_goal") {
			return { status: d.kind, rel, lines, reason: d.reason };
		}
		if (hasTheme) return { status: "migrated", rel, lines };
		return { status: "must_migrate", rel, lines, soft: hasI18n ? "i18n" : "pure" };
	}

	// Mixed render + data without clear view separation
	if (jsx && dataHeavy) {
		if (d?.kind === "permanent_desktop" && /shell|container|entry|assembler|page host/i.test(d.reason || "")) {
			return { status: "permanent_desktop", rel, lines, reason: d.reason };
		}
		return { status: "must_split", rel, lines, tags: { hasAtom, hasIpc, hasRouter } };
	}

	return { status: "skip", rel, lines };
}

const deferrals = loadDeferrals();
const badDeferrals = [];
for (const [p, d] of Object.entries(deferrals)) {
	if (
		!["permanent_desktop", "host_primitive_hold", "non_goal"].includes(d.kind) ||
		FORBIDDEN_SPLIT_WAIT.test(d.reason || "")
	) {
		badDeferrals.push({ path: p, kind: d.kind, reason: d.reason });
	}
}

const buckets = {
	migrated: [],
	split_ok: [],
	must_split: [],
	must_migrate: [],
	must_host_hold: [],
	host_primitive_hold: [],
	permanent_desktop: [],
	non_goal: [],
	skip: [],
};

for (const f of walk(rendererRoot)) {
	const text = readFileSync(f, "utf8");
	const c = classify(f, text, deferrals);
	(buckets[c.status] || buckets.skip).push(c);
}

const summary = {
	migrated: buckets.migrated.length,
	split_ok: buckets.split_ok.length,
	must_split_open: buckets.must_split.length,
	must_migrate_open: buckets.must_migrate.length,
	must_host_hold_open: buckets.must_host_hold.length,
	host_primitive_hold: buckets.host_primitive_hold.length,
	permanent_desktop: buckets.permanent_desktop.length,
	non_goal: buckets.non_goal.length,
	bad_deferrals: badDeferrals.length,
};

const report = {
	summary,
	must_split: buckets.must_split.map((e) => ({ path: e.rel, lines: e.lines })),
	must_migrate: buckets.must_migrate.map((e) => ({ path: e.rel, lines: e.lines, soft: e.soft })),
	must_host_hold: buckets.must_host_hold.map((e) => ({ path: e.rel, lines: e.lines })),
	bad_deferrals: badDeferrals,
};

if (wantJson) console.log(JSON.stringify(report, null, 2));
else {
	console.log("=== must-split inventory gate ===");
	console.log(JSON.stringify(summary, null, 2));
	console.log("\n--- MUST_SPLIT ---");
	for (const e of report.must_split) console.log(`must_split\t${e.lines}\t${e.path}`);
	console.log("\n--- MUST_MIGRATE ---");
	for (const e of report.must_migrate) console.log(`must_migrate\t${e.soft || ""}\t${e.lines}\t${e.path}`);
	console.log("\n--- MUST_HOST_HOLD ---");
	for (const e of report.must_host_hold) console.log(`must_host_hold\t${e.lines}\t${e.path}`);
	if (badDeferrals.length) {
		console.log("\n--- BAD DEFERRALS ---");
		for (const b of badDeferrals.slice(0, 40))
			console.log(`bad\t${b.kind}\t${b.path}\t${(b.reason || "").slice(0, 70)}`);
	}
}

const fail =
	summary.must_split_open > 0 ||
	summary.must_migrate_open > 0 ||
	summary.must_host_hold_open > 0 ||
	summary.bad_deferrals > 0;

if (fail) {
	console.error(
		`\nFAILED must_split=${summary.must_split_open} must_migrate=${summary.must_migrate_open} must_host_hold=${summary.must_host_hold_open} bad_deferrals=${summary.bad_deferrals}`,
	);
	process.exit(1);
}
console.error("\nOK: must-split backlog clear");
process.exit(0);
