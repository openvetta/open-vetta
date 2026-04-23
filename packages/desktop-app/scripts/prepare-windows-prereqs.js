import { spawnSync } from "node:child_process";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const repoRoot = join(projectRoot, "..", "..");
const buildScriptPath = join(repoRoot, "scripts", "build.ps1");

function resolvePowerShellExecutable() {
	for (const candidate of ["pwsh.exe"]) {
		const result = spawnSync(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
			stdio: "ignore",
		});
		if (result.status === 0) {
			return candidate;
		}
	}
	throw new Error("Windows prerequisites require PowerShell, but neither powershell.exe nor pwsh.exe was found.");
}

function main() {
	if (process.platform !== "win32") {
		console.log(`[prepare-windows-prereqs] skipped on non-Windows host: ${process.platform}`);
		return;
	}

	const powershell = resolvePowerShellExecutable();
	console.log(`[prepare-windows-prereqs] running ${buildScriptPath} desktop`);

	const result = spawnSync(
		powershell,
		["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", buildScriptPath, "-Target", "desktop"],
		{
			cwd: repoRoot,
			stdio: "inherit",
		},
	);

	if (result.status !== 0) {
		process.exitCode = result.status ?? 1;
	}
}

main();
