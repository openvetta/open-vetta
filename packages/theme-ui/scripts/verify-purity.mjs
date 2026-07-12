/**
 * Structural guard: theme-ui sources must stay free of desktop private imports.
 * Run: bun packages/theme-ui/scripts/verify-purity.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const forbidden = /@shared\/|@domains\/|@preload\/|from ["']jotai|window\.vetta/;

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) files.push(...(await walk(full)));
		else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
	}
	return files;
}

const requiredExports = [
	"SceneCard",
	"SkillCard",
	"DefaultSceneCarousel",
	"DefaultSkillBadgeRow",
	"InputBarToolbarButton",
	"SendButton",
	"DrawerCard",
	"TodoCard",
	"SandboxPermissionCard",
	"ActivityPanelFrame",
];

const files = await walk(root);
const violations = [];
for (const file of files) {
	const text = await readFile(file, "utf8");
	if (forbidden.test(text)) {
		violations.push(path.relative(root, file));
	}
}

const chatIndex = await readFile(path.join(root, "chat/index.ts"), "utf8");
const activityIndex = await readFile(path.join(root, "activity/index.ts"), "utf8");
const missing = requiredExports.filter((name) => {
	const hay = name === "ActivityPanelFrame" ? activityIndex : chatIndex;
	return !hay.includes(name);
});

if (violations.length > 0 || missing.length > 0) {
	console.error("theme-ui purity verify FAILED");
	if (violations.length) console.error("forbidden imports:\n", violations.join("\n"));
	if (missing.length) console.error("missing exports:\n", missing.join("\n"));
	process.exit(1);
}

console.log(`theme-ui purity OK: ${files.length} files, exports present`);
