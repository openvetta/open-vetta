import { i18n } from "@shared/i18n";
import { showToast } from "@shared/store/toast-atoms";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import type { FilePathCopyAction } from "@vetta-org/theme-ui/file-preview";

/** Keep native separators and SSH host identity; paths already come from the host. */
export async function copyFilePathsToClipboard(paths: readonly string[]): Promise<boolean> {
	if (paths.length === 0) return false;
	try {
		await navigator.clipboard.writeText(paths.join("\n"));
		showToast({ variant: "success", message: i18n.t("common:filePreview.pathCopied") });
		return true;
	} catch {
		showToast({ variant: "error", message: i18n.t("common:filePreview.copyPathFailed") });
		return false;
	}
}

export function createFilePathCopyAction(path: string | undefined): FilePathCopyAction | undefined {
	if (!path) return undefined;
	const remote = isSshProjectUri(path);
	return {
		label: i18n.t(remote ? "common:filePreview.copyRemoteLocationShort" : "common:filePreview.copyPathShort"),
		title: i18n.t(remote ? "common:filePreview.copyRemoteLocation" : "common:filePreview.copyAbsolutePath"),
		onCopy: () => void copyFilePathsToClipboard([path]),
	};
}
