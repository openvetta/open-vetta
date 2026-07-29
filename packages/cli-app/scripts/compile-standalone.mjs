import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(cliAppRoot, "../..");
const codingAgentPackagePath = join(repositoryRoot, "packages", "coding-agent", "package.json");
const cliEntryPath = join(cliAppRoot, "src", "cli.ts");

const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(codingAgentPackagePath, "utf8"));
if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
	throw new Error(`Invalid coding-agent package metadata: ${codingAgentPackagePath}`);
}

const compiledPackageMetadata = {
	name: packageJson.name,
	version: packageJson.version,
	piConfig:
		typeof packageJson.piConfig?.name === "string"
			? {
					name: packageJson.piConfig.name,
				}
			: undefined,
};
const buildArgs = [
	"build",
	cliEntryPath,
	"--compile",
	"--define",
	`VETTA_COMPILED_PACKAGE_METADATA=${JSON.stringify(compiledPackageMetadata)}`,
	"--outfile",
	options.outfile,
];
if (options.target) buildArgs.push("--target", options.target);
if (options.metafile) buildArgs.push(`--metafile=${options.metafile}`);

await run(process.platform === "win32" ? "bun.exe" : "bun", buildArgs);

function parseArgs(args) {
	let outfile;
	let target;
	let metafile;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--outfile") {
			outfile = readValue(args, ++index, arg);
			continue;
		}
		if (arg === "--target") {
			target = readValue(args, ++index, arg);
			continue;
		}
		if (arg === "--metafile") {
			metafile = readValue(args, ++index, arg);
			continue;
		}
		throw new Error(`Unknown compile-standalone option: ${arg}`);
	}
	if (!outfile) throw new Error("compile-standalone requires --outfile <path>");
	return { metafile, outfile: resolve(outfile), target };
}

function readValue(args, index, option) {
	const value = args[index];
	if (!value) throw new Error(`${option} requires a value`);
	return value;
}

async function run(command, args) {
	await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: repositoryRoot,
			stdio: "inherit",
			windowsHide: true,
		});
		child.once("error", rejectPromise);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(new Error(`Standalone CLI compile failed (code=${code ?? "null"}, signal=${signal ?? "null"})`));
		});
	});
}
