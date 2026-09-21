import type { ExternalSessionFileHost } from "./host-contracts.js";

/**
 * External identity is a configured tool directory, not file content.
 * Content matchers (especially omp `type: title`) also match titled Vetta
 * legacy JSONL that lives under a project `.vetta/sessions` dir.
 */
export function isUnderExternalSessionRoot(path: string, host: ExternalSessionFileHost): boolean {
	const roots = host.resolveSessionRoots();
	if (roots.length === 0) return false;
	const normalizedPath = normalizePath(path);
	return roots.some((root) => {
		if (host.samePath(path, root.path)) return true;
		const normalizedRoot = normalizePath(root.path);
		if (normalizedRoot.length === 0) return false;
		return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
	});
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
