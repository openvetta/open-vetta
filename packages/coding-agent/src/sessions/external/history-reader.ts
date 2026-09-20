import type { HistoryEntry, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import { identifyExternalSessionFormat } from "./formats.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

/** 只读投影外部工具会话；身份由各格式适配器判定，不加锁、不写回。 */
export class ExternalRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	constructor(private readonly host: ExternalSessionFileHost) {}

	canRead(sessionPath: string): boolean {
		try {
			return identifyExternalSessionFormat(sessionPath, this.host)?.canRead(sessionPath, this.host) === true;
		} catch {
			return false;
		}
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const format = identifyExternalSessionFormat(sessionPath, this.host);
		if (!format) {
			throw new Error("EXTERNAL_SESSION_CORRUPTED_HEADER");
		}
		return { history: format.readHistory(sessionPath, this.host) };
	}
}
