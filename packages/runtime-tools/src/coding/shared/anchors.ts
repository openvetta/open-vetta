export const ANCHOR_SEPARATOR = "→";
export const ANCHOR_HASH_WIDTH = 4;

export function anchorLineHash(line: string): string {
	const normalized = line.replace(/\s+/g, "");
	let hash = 0x811c9dc5;
	for (let index = 0; index < normalized.length; index++) {
		hash ^= normalized.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36).padStart(ANCHOR_HASH_WIDTH, "0").slice(-ANCHOR_HASH_WIDTH);
}

export function renderAnchoredLines(lines: readonly string[], startLine: number): string[] {
	return lines.map((line, index) => `${startLine + index}:${anchorLineHash(line)}${ANCHOR_SEPARATOR}${line}`);
}
