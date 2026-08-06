import type {
	CodingAgentHistoricalSessionIncompatibilityCode,
	CodingAgentHistoricalSessionMigrationIncompatible,
} from "@vetta/coding-agent/historical-sessions";
import type { RpcRuntimeDecision, RpcSessionIncompatibilityFailure } from "@vetta/coding-agent/rpc";

type RequestedRuntimeBackend = RpcRuntimeDecision["requestedBackend"];

export class SessionCompatibilityError extends Error {
	readonly errorCode: CodingAgentHistoricalSessionIncompatibilityCode;
	readonly requestedBackend: RequestedRuntimeBackend;
	readonly sessionPath: string;
	readonly sourceVersion: number | undefined;
	readonly issueCode: string | undefined;
	readonly issueCount: number | undefined;

	constructor(requestedBackend: RequestedRuntimeBackend, result: CodingAgentHistoricalSessionMigrationIncompatible) {
		super("Legacy session cannot be resumed safely by the requested runtime");
		this.name = "SessionCompatibilityError";
		this.requestedBackend = requestedBackend;
		this.errorCode = result.errorCode;
		this.sessionPath = result.sourcePath;
		this.sourceVersion = result.sourceVersion;
		this.issueCode = result.issueCode;
		this.issueCount = result.issueCount;
	}

	toRpcStartupFailure(): RpcSessionIncompatibilityFailure {
		return {
			type: "response",
			command: "startup",
			success: false,
			errorCode: this.errorCode,
			error: this.message,
			requestedBackend: this.requestedBackend,
			sessionPath: this.sessionPath,
			...(this.sourceVersion === undefined ? {} : { sourceVersion: this.sourceVersion }),
			...(this.issueCode === undefined ? {} : { issueCode: this.issueCode }),
			...(this.issueCount === undefined ? {} : { issueCount: this.issueCount }),
		};
	}
}
