import { describe, expect, it } from "vitest";
import {
	findBuildOrderViolations,
	findLayeredBuildOrderViolations,
	parseBuildPackageOrder,
} from "./check-build-order.mjs";
import { findPackageBoundaryViolations } from "./check-package-boundaries.mjs";
import { batchPaths, createQuickCheckPlan, isBiomeGlobalTrigger } from "./check-quick.mjs";
import { findStandaloneCliBuildViolations } from "./check-standalone-cli-build.mjs";
import { changedFiles, expandTestablePackages, packagesFromPaths, parseBaseArgs, stagedFiles } from "./lib.mjs";
import { createChangedTestPlan, parseArgs } from "./test-changed.mjs";

describe("changed file selection", () => {
	it("combines committed, working tree, and untracked paths", () => {
		const outputs = new Map([
			[["merge-base", "HEAD", "origin/dev"].join("\0"), "base-sha"],
			[["diff", "--name-only", "-z", "base-sha...HEAD"].join("\0"), "packages/ai/src/a.ts\0"],
			[["diff", "--name-only", "-z", "HEAD"].join("\0"), "packages/agent/src/b.ts\0"],
			[
				["ls-files", "--others", "--exclude-standard", "-z"].join("\0"),
				"packages/ecosystem-adapter/src/new.ts\0packages/ai/src/a.ts\0",
			],
		]);
		const git = (args) => outputs.get(args.join("\0")) ?? "";

		expect(changedFiles("origin/dev", git)).toEqual(
			["packages/agent/src/b.ts", "packages/ai/src/a.ts", "packages/ecosystem-adapter/src/new.ts"].sort(),
		);
	});

	it("preserves unusual paths from NUL-delimited Git output", () => {
		const outputs = new Map([
			[["merge-base", "HEAD", "origin/dev"].join("\0"), "base-sha"],
			[["diff", "--name-only", "-z", "base-sha...HEAD"].join("\0"), "packages/ai/src/line\nbreak.ts\0"],
			[["diff", "--name-only", "-z", "HEAD"].join("\0"), "packages/ai/src/a & b.ts\0"],
			[["ls-files", "--others", "--exclude-standard", "-z"].join("\0"), ""],
		]);
		const git = (args) => outputs.get(args.join("\0")) ?? "";

		expect(changedFiles("origin/dev", git)).toEqual(
			["packages/ai/src/a & b.ts", "packages/ai/src/line\nbreak.ts"].sort(),
		);
	});

	it("preserves unusual staged paths", () => {
		const git = () => "packages/ai/src/a & b.ts\0packages/ai/src/line\nbreak.ts\0";
		expect(stagedFiles(git)).toEqual(["packages/ai/src/a & b.ts", "packages/ai/src/line\nbreak.ts"]);
	});

	it("does not hide an invalid base ref", () => {
		const git = () => {
			throw new Error("missing base");
		};
		expect(() => changedFiles("missing", git)).toThrow("missing base");
	});

	it("normalizes Windows package paths", () => {
		expect(packagesFromPaths(["packages\\ai\\src\\index.ts"])).toEqual(["ai"]);
	});

	it("validates base arguments shared by changed-file commands", () => {
		expect(parseBaseArgs(["--base", "origin/main"])).toEqual({ base: "origin/main" });
		expect(() => parseBaseArgs(["--base", "--unknown"])).toThrow("--base requires a git ref");
		expect(() => parseBaseArgs(["--unknown"])).toThrow("unknown argument");
	});
});

describe("standalone CLI 编译入口守卫", () => {
	it("拒绝在 Desktop 生产代码中直接编译 CLI 源入口", () => {
		expect(
			findStandaloneCliBuildViolations(
				"packages/desktop-app/src/main/example.ts",
				`spawn("bun", ["build", join(cliAppRoot, "src", "cli.ts"), "--compile"]);`,
			),
		).toHaveLength(1);
	});

	it("允许调用统一编译器和编译其他入口", () => {
		expect(
			findStandaloneCliBuildViolations(
				"packages/desktop-app/src/main/example.ts",
				`spawn("bun", [join(cliAppRoot, "scripts", "compile-standalone.mjs")]);`,
			),
		).toEqual([]);
		expect(
			findStandaloneCliBuildViolations(
				"packages/desktop-app/src/main/dev-cli-shim.ts",
				`spawn("bun", ["build", launcherEntryPath, "--compile"]);`,
			),
		).toEqual([]);
	});
});

describe("quick check selection", () => {
	it("checks every existing changed file and skips deleted files", () => {
		const existing = new Set(["package.json", "packages/ai/src/index.ts"]);
		const plan = createQuickCheckPlan(
			["packages\\ai\\src\\index.ts", "deleted.ts", "package.json", "package.json"],
			(file) => existing.has(file),
		);

		expect(plan.fullBiome).toBe(false);
		expect(plan.existingFiles).toEqual(["package.json", "packages/ai/src/index.ts"]);
		expect(plan.biomeBatches.flat()).toEqual(plan.existingFiles);
	});

	it("falls back to a full Biome check when any Biome config changes", () => {
		expect(isBiomeGlobalTrigger("config/biome.jsonc")).toBe(true);
		const plan = createQuickCheckPlan(["biome.json", "packages/ai/src/index.ts"], () => true);
		expect(plan.fullBiome).toBe(true);
		expect(plan.biomeBatches).toEqual([["."]]);
	});

	it("batches paths without dropping or reordering them", () => {
		const paths = ["first.ts", "second-long.ts", "third.ts"];
		const batches = batchPaths(paths, 20);
		expect(batches.length).toBeGreaterThan(1);
		expect(batches.flat()).toEqual(paths);
	});
});

describe("affected package selection", () => {
	it("includes transitive testable dependents", () => {
		expect(expandTestablePackages(["ai"])).toEqual(["ai", "agent", "coding-agent"]);
		expect(expandTestablePackages(["ecosystem-adapter"])).toEqual(["coding-agent", "ecosystem-adapter"]);
	});

	it("runs every core test package for global quality inputs", () => {
		const plan = createChangedTestPlan(["bun.lock"]);
		expect(plan.globalTriggers).toEqual(["bun.lock"]);
		expect(plan.toTest).toEqual(["ai", "agent", "coding-agent", "ecosystem-adapter"]);
	});

	it("runs quality tests when their implementation changes", () => {
		const plan = createChangedTestPlan(["scripts/quality/test-changed.mjs"]);
		expect(plan.runQuality).toBe(true);
		expect(plan.toTest).toEqual(["ai", "agent", "coding-agent", "ecosystem-adapter"]);
	});

	it("accepts both base argument forms and rejects unknown arguments", () => {
		expect(parseArgs(["--base", "origin/main"])).toEqual({ base: "origin/main" });
		expect(parseArgs(["--base=origin/release"])).toEqual({ base: "origin/release" });
		expect(() => parseArgs(["--unknown"])).toThrow("unknown argument");
	});
});

describe("package boundary analysis", () => {
	const libFile = "packages/ai/src/example.ts";

	it("detects side-effect and dynamic app imports", () => {
		expect(findPackageBoundaryViolations(libFile, 'import "@vetta/desktop-app";')).toHaveLength(1);
		expect(
			findPackageBoundaryViolations(libFile, 'const app = await import("@vetta/cli-app/runtime");'),
		).toHaveLength(1);
	});

	it("ignores import-looking comments", () => {
		expect(findPackageBoundaryViolations(libFile, '// import app from "@vetta/desktop-app";')).toEqual([]);
	});

	it("blocks production imports from test trees but allows test files", () => {
		const source = 'import { fixture } from "../../agent/test/fixture";';
		expect(findPackageBoundaryViolations(libFile, source)).toHaveLength(1);
		expect(findPackageBoundaryViolations("packages/ai/src/example.test.ts", source)).toEqual([]);
	});

	it("allows raw capability ids only in capability definition modules", () => {
		const source = 'const id = "cap.domain.vetta.example.read";';
		expect(findPackageBoundaryViolations("packages/capability-sdk/src/domain/example.ts", source)).toEqual([]);
		expect(findPackageBoundaryViolations("packages/capability-sdk/src/adapters/example.ts", source)).toHaveLength(1);
	});

	it("requires schema-backed capability definitions with generated catalogs", () => {
		const source = `
			const TOKEN = defineCapability<Input, Output>({
				parseInput: parse,
				parseOutput: parse,
			});
		`;
		expect(findPackageBoundaryViolations("packages/capability-sdk/src/foundation/example.ts", source)).toHaveLength(
			2,
		);
	});

	it("blocks Desktop globals in ordinary plugins while preserving the built-in workbench exception", () => {
		const source = "window.vetta.fs.readFile(path);";
		expect(findPackageBoundaryViolations("packages/plugins/externals/example/src/index.ts", source)).toHaveLength(1);
		expect(findPackageBoundaryViolations("packages/plugins/presets/plugin-workbench/src/index.ts", source)).toEqual(
			[],
		);
	});

	it("blocks Desktop production imports from cli-app source paths", () => {
		expect(
			findPackageBoundaryViolations(
				"packages/desktop-app/src/main/runtime.ts",
				'import { createRuntime } from "../../../../cli-app/src/runtime.js";',
			),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations(
				"packages/desktop-app/src/main/runtime.ts",
				'import { createRuntime } from "@vetta/runtime-composition";',
			),
		).toEqual([]);
	});

	it("keeps the greenfield runtime kernel independent from coding-agent", () => {
		const source = 'import { AgentSession } from "@vetta/coding-agent";';
		expect(findPackageBoundaryViolations("packages/runtime-core/src/kernel/example.ts", source)).toHaveLength(1);
		expect(
			findPackageBoundaryViolations("packages/runtime-storage/src/conversation/example.ts", source),
		).toHaveLength(1);
		expect(findPackageBoundaryViolations("packages/runtime-tools/src/coding/example.ts", source)).toHaveLength(1);
		expect(
			findPackageBoundaryViolations(
				"packages/runtime-core/src/runtime-host/greenfield-session-projection.ts",
				source,
			),
		).toHaveLength(1);
		expect(findPackageBoundaryViolations("packages/runtime-core/src/runtime-host/example.ts", source)).toHaveLength(
			1,
		);
	});

	it("keeps every runtime-core production module independent from coding-agent", () => {
		const source = 'import { SessionManager } from "@vetta/coding-agent";';
		expect(
			findPackageBoundaryViolations("packages/runtime-core/src/runtime-host/runtime-host.ts", source),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations("packages/runtime-core/src/runtime-host/session-services.ts", source),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations("packages/runtime-core/src/runtime-host/legacy-session-services.ts", source),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations("packages/coding-agent/src/adapters/runtime-core/composition.ts", source),
		).toEqual([]);
	});

	it("keeps agent-core below runtime and product packages", () => {
		expect(
			findPackageBoundaryViolations(
				"packages/agent/src/example.ts",
				'import { TurnPipeline } from "@vetta/runtime-core/kernel";',
			),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations(
				"packages/agent/src/example.ts",
				'import { createCodingAgent } from "@vetta/coding-agent";',
			),
		).toHaveLength(1);
		expect(
			findPackageBoundaryViolations(
				"packages/runtime-core/src/kernel/agent-core-turn-engine.ts",
				'import { agentLoopContinue } from "@vetta/agent-core";',
			),
		).toEqual([]);
	});
});

describe("workspace build order", () => {
	it("parses package build calls once in declaration order", () => {
		expect(
			parseBuildPackageOrder(`
				build_pkg packages/runtime-core
				build_pkg packages/coding-agent
				build_pkg packages/coding-agent
			`),
		).toEqual(["packages/runtime-core", "packages/coding-agent"]);
	});

	it("rejects a production dependency built after its consumer", () => {
		const manifests = [
			{
				dir: "packages/runtime-core",
				name: "@vetta/runtime-core",
			},
			{
				dir: "packages/coding-agent",
				name: "@vetta/coding-agent",
				dependencies: { "@vetta/runtime-core": "workspace:*" },
			},
		];

		expect(findBuildOrderViolations(["packages/coding-agent", "packages/runtime-core"], manifests)).toEqual([
			"packages/coding-agent is built before its workspace dependency packages/runtime-core",
		]);
		expect(findBuildOrderViolations(["packages/runtime-core", "packages/coding-agent"], manifests)).toEqual([]);
	});

	it("ignores test-only dependency edges", () => {
		const manifests = [
			{
				dir: "packages/runtime-core",
				name: "@vetta/runtime-core",
				devDependencies: { "@vetta/coding-agent": "workspace:*" },
			},
			{
				dir: "packages/coding-agent",
				name: "@vetta/coding-agent",
			},
		];

		expect(findBuildOrderViolations(["packages/runtime-core", "packages/coding-agent"], manifests)).toEqual([]);
	});

	it("rejects parallel or reversed desktop prerequisite layers", () => {
		const packageConfigs = {
			"runtime-core": { dir: "packages/runtime-core" },
			"coding-agent": { dir: "packages/coding-agent" },
		};
		const manifests = [
			{
				dir: "packages/runtime-core",
				name: "@vetta/runtime-core",
			},
			{
				dir: "packages/coding-agent",
				name: "@vetta/coding-agent",
				dependencies: { "@vetta/runtime-core": "workspace:*" },
			},
		];

		expect(findLayeredBuildOrderViolations(packageConfigs, [["coding-agent"], ["runtime-core"]], manifests)).toEqual([
			"coding-agent is not in a later build layer than its workspace dependency runtime-core",
		]);
		expect(findLayeredBuildOrderViolations(packageConfigs, [["runtime-core"], ["coding-agent"]], manifests)).toEqual(
			[],
		);
	});
});
