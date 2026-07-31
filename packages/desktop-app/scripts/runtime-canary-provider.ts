import { writeFile } from "node:fs/promises";
import { runtimeCanaryModeSchema } from "../src/main/app-debug/runtime-canary/contracts.js";
import { startRuntimeCanaryProvider } from "../src/main/app-debug/runtime-canary/provider.js";

const rootDir = readArgument("--root");
const readyFilePath = readArgument("--ready-file");
const mode = runtimeCanaryModeSchema.parse(readArgument("--mode"));
const provider = await startRuntimeCanaryProvider(rootDir, mode);
await writeFile(readyFilePath, JSON.stringify(provider.fixture, null, 2));

await new Promise<void>((resolve) => {
	process.once("SIGINT", resolve);
	process.once("SIGTERM", resolve);
});
await provider.close();

function readArgument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index === -1 ? undefined : process.argv[index + 1];
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}
