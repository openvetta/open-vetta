import { writeSync } from "node:fs";
import { generateInternalControlReportPdf, InternalControlReportError } from "../pdf/internal-control-report.js";

export type PdfCliCommand =
	| { type: "help" }
	| { type: "error"; code: string; exitCode: number; message: string }
	| {
			type: "internal-control-report";
			resultPath: string;
			output?: string;
			template?: string;
			titleYear?: number;
			keepTemp?: boolean;
	  };

export interface PdfCliResponse {
	ok: boolean;
	output?: string;
	template?: string;
	renderer?: "electron";
	error?: {
		code: string;
		message: string;
	};
}

const HELP_TEXT = `Vetta PDF command line interface

Usage:
  Vetta.exe --internal-control-report-pdf <result.json> [options]
  Vetta.exe pdf internal-control-report <result.json> [options]
  Vetta.exe -h
  Vetta.exe --help

Description:
  Generate an internal control review PDF from result.json using Vetta Desktop's
  bundled Electron Chromium renderer. This does not require Google Chrome or
  Microsoft Edge to be installed on the user machine.

Options:
  --output <path>       Output PDF path. Defaults to:
                        <result.json directory>/<unit_name>_<unit_code>_审查报告.pdf
  --template <id>       HTML template id. Defaults to "default".
  --title-year <year>   Year shown in the report subtitle. Defaults to 2025.
  --keep-temp           Keep the temporary HTML directory for debugging.
  -h, --help            Show this help text.

Output:
  On success, stdout contains JSON:
    {"ok":true,"output":"C:\\\\path\\\\report.pdf","template":"default","renderer":"electron"}

  On failure, stdout contains JSON:
    {"ok":false,"error":{"code":"VALIDATION_ERROR","message":"..."}}

Exit codes:
  0  Success or help displayed.
  2  Invalid command line arguments.
  3  result.json validation or read error.
  4  PDF rendering error.
`;

class PdfCliError extends Error {
	constructor(
		readonly code: string,
		readonly exitCode: number,
		message: string,
	) {
		super(message);
		this.name = "PdfCliError";
	}
}

function findCommandStart(argv: string[]): number {
	return argv.findIndex(
		(arg) => arg === "--internal-control-report-pdf" || arg === "pdf" || arg === "-h" || arg === "--help",
	);
}

function parseOptions(args: string[]): Omit<Extract<PdfCliCommand, { type: "internal-control-report" }>, "type"> {
	let resultPath: string | undefined;
	let output: string | undefined;
	let template: string | undefined;
	let titleYear: number | undefined;
	let keepTemp = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-h" || arg === "--help") {
			throw new PdfCliError("HELP_REQUESTED", 0, HELP_TEXT);
		}
		if (arg === "--output") {
			const value = args[++i];
			if (!value) throw new PdfCliError("ARGUMENT_ERROR", 2, "--output requires a path");
			output = value;
			continue;
		}
		if (arg === "--template") {
			const value = args[++i];
			if (!value) throw new PdfCliError("ARGUMENT_ERROR", 2, "--template requires an id");
			template = value;
			continue;
		}
		if (arg === "--title-year") {
			const value = args[++i];
			if (!value) throw new PdfCliError("ARGUMENT_ERROR", 2, "--title-year requires a year");
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
				throw new PdfCliError("ARGUMENT_ERROR", 2, "--title-year must be a four digit year");
			}
			titleYear = parsed;
			continue;
		}
		if (arg === "--keep-temp") {
			keepTemp = true;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new PdfCliError("ARGUMENT_ERROR", 2, `Unknown option: ${arg}`);
		}
		if (resultPath) {
			throw new PdfCliError("ARGUMENT_ERROR", 2, `Unexpected argument: ${arg}`);
		}
		resultPath = arg;
	}

	if (!resultPath) {
		throw new PdfCliError("ARGUMENT_ERROR", 2, "Missing <result.json> path");
	}
	return { resultPath, output, template, titleYear, keepTemp };
}

export function parsePdfCliCommand(argv: string[]): PdfCliCommand | null {
	const start = findCommandStart(argv);
	if (start < 0) return null;
	const args = argv.slice(start);
	const command = args[0];

	try {
		if (command === "-h" || command === "--help") {
			return { type: "help" };
		}
		if (command === "--internal-control-report-pdf") {
			return { type: "internal-control-report", ...parseOptions(args.slice(1)) };
		}
		if (command === "pdf") {
			const subcommand = args[1];
			if (subcommand === "-h" || subcommand === "--help") {
				return { type: "help" };
			}
			if (subcommand !== "internal-control-report") {
				throw new PdfCliError("ARGUMENT_ERROR", 2, `Unknown pdf subcommand: ${subcommand ?? ""}`);
			}
			return { type: "internal-control-report", ...parseOptions(args.slice(2)) };
		}
		return null;
	} catch (error) {
		if (error instanceof PdfCliError && error.code === "HELP_REQUESTED") {
			return { type: "help" };
		}
		if (error instanceof PdfCliError) {
			return { type: "error", code: error.code, exitCode: error.exitCode, message: error.message };
		}
		const message = error instanceof Error ? error.message : String(error);
		return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message };
	}
}

function writeJson(response: PdfCliResponse): void {
	writeSync(1, `${JSON.stringify(response)}\n`);
}

export async function runPdfCliCommand(command: PdfCliCommand): Promise<number> {
	if (command.type === "help") {
		writeSync(1, HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		writeJson({ ok: false, error: { code: command.code, message: command.message } });
		return command.exitCode;
	}

	try {
		const result = await generateInternalControlReportPdf(command.resultPath, {
			output: command.output,
			template: command.template,
			titleYear: command.titleYear,
			keepTemp: command.keepTemp,
		});
		writeJson({ ok: true, ...result });
		return 0;
	} catch (error) {
		if (error instanceof InternalControlReportError) {
			writeJson({ ok: false, error: { code: error.code, message: error.message } });
			if (error.code === "RENDER_ERROR") return 4;
			return 3;
		}
		if (error instanceof PdfCliError) {
			if (error.exitCode === 0) {
				writeSync(1, error.message);
				return 0;
			}
			writeJson({ ok: false, error: { code: error.code, message: error.message } });
			return error.exitCode;
		}
		const message = error instanceof Error ? error.message : String(error);
		writeJson({ ok: false, error: { code: "UNKNOWN_ERROR", message } });
		return 4;
	}
}
