import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

const CHUNK_SIZE = 64 * 1024;

/** Read at most `maxLines` lines without requiring EOF. */
export function readPrefixLinesSync(path: string, maxLines: number): string {
	if (maxLines <= 0) return "";
	const fd = openSync(path, "r");
	try {
		const decoder = new StringDecoder("utf8");
		const lines: string[] = [];
		const buffer = Buffer.alloc(CHUNK_SIZE);
		let leftover = "";
		while (lines.length < maxLines) {
			const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) {
				leftover += decoder.end();
				if (leftover.length > 0) lines.push(leftover);
				break;
			}
			leftover += decoder.write(buffer.subarray(0, bytesRead));
			const parts = leftover.split(/\r?\n/);
			leftover = parts.pop() ?? "";
			for (const part of parts) {
				lines.push(part);
				if (lines.length >= maxLines) return lines.join("\n");
			}
		}
		return lines.slice(0, maxLines).join("\n");
	} finally {
		closeSync(fd);
	}
}
