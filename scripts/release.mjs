#!/usr/bin/env node
/**
 * Release script for pi-mono
 *
 * Usage: node scripts/release.mjs <major|minor|patch>
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Bump lockstep package versions
 * 3. Update CHANGELOG.md files: [Unreleased] -> [version] - date
 * 4. Commit and tag
 * 5. Optionally publish to private registry
 * 6. Add new [Unreleased] section to changelogs
 * 7. Commit
 * 8. Push current branch and tag
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const BUMP_TYPE = process.argv[2];
const SHOULD_PUBLISH = process.env.RELEASE_PUBLISH === "true";
const RELEASE_BRANCH = process.env.RELEASE_BRANCH;

if (!["major", "minor", "patch"].includes(BUMP_TYPE)) {
	console.error("Usage: node scripts/release.mjs <major|minor|patch>");
	process.exit(1);
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch (e) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

function getCurrentBranch() {
	return run("git branch --show-current", { silent: true }).trim();
}

function getVersion() {
	const pkg = JSON.parse(readFileSync("packages/ai/package.json", "utf-8"));
	return pkg.version;
}

function parseSemver(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Invalid semver: ${version}`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

function bumpSemver(version, bumpType) {
	const parsed = parseSemver(version);
	if (bumpType === "major") {
		return `${parsed.major + 1}.0.0`;
	}
	if (bumpType === "minor") {
		return `${parsed.major}.${parsed.minor + 1}.0`;
	}
	return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function getLockstepPackageJsonPaths() {
	const packagesDir = "packages";
	const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	return [
		"package.json",
		...packageDirs.map((dir) => join(packagesDir, dir, "package.json")).filter((path) => existsSync(path)),
	];
}

function bumpLockstepVersions(bumpType) {
	const currentVersion = getVersion();
	const nextVersion = bumpSemver(currentVersion, bumpType);
	const packageJsonPaths = getLockstepPackageJsonPaths();

	for (const packageJsonPath of packageJsonPaths) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		if (!pkg.version) {
			continue;
		}
		pkg.version = nextVersion;
		writeFileSync(packageJsonPath, JSON.stringify(pkg, null, "\t") + "\n");
		console.log(`  Updated ${packageJsonPath} version -> ${nextVersion}`);
	}

	return nextVersion;
}

function getChangelogs() {
	const packagesDir = "packages";
	const packages = readdirSync(packagesDir);
	return packages
		.map((pkg) => join(packagesDir, pkg, "CHANGELOG.md"))
		.filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.log(`  Skipping ${changelog}: no [Unreleased] section`);
			continue;
		}

		const updated = content.replace(
			"## [Unreleased]",
			`## [${version}] - ${date}`
		);
		writeFileSync(changelog, updated);
		console.log(`  Updated ${changelog}`);
	}
}

function addUnreleasedSection() {
	const changelogs = getChangelogs();
	const unreleasedSection = "## [Unreleased]\n\n";

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		// Insert after "# Changelog\n\n"
		const updated = content.replace(
			/^(# Changelog\n\n)/,
			`$1${unreleasedSection}`
		);
		writeFileSync(changelog, updated);
		console.log(`  Added [Unreleased] to ${changelog}`);
	}
}

// Main flow
console.log("\n=== Release Script ===\n");

// 1. Check for uncommitted changes
console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
if (status && status.trim()) {
	console.error("Error: Uncommitted changes detected. Commit or stash first.");
	console.error(status);
	process.exit(1);
}
console.log("  Working directory clean\n");

// 2. Bump version
console.log(`Bumping version (${BUMP_TYPE})...`);
const version = bumpLockstepVersions(BUMP_TYPE);
run("node scripts/sync-versions.js");
console.log(`  New version: ${version}\n`);

// 3. Update changelogs
console.log("Updating CHANGELOG.md files...");
updateChangelogsForRelease(version);
console.log();

// 4. Commit and tag
console.log("Committing and tagging...");
run("git add .");
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
console.log();

// 5. Publish
if (SHOULD_PUBLISH) {
	console.log("Publishing to private registry...");
	run("bun run publish:private");
	console.log();
} else {
	console.log("Skipping publish (set RELEASE_PUBLISH=true to enable private publish)\n");
}

// 6. Add new [Unreleased] sections
console.log("Adding [Unreleased] sections for next cycle...");
addUnreleasedSection();
console.log();

// 7. Commit
console.log("Committing changelog updates...");
run("git add .");
run(`git commit -m "Add [Unreleased] section for next cycle"`);
console.log();

// 8. Push
console.log("Pushing to remote...");
const branch = RELEASE_BRANCH || getCurrentBranch();
run(`git push origin ${branch}`);
run(`git push origin v${version}`);
console.log();

console.log(`=== Released v${version} ===`);
