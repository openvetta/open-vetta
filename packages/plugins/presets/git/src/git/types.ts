/** Single-letter status shown in the tree (collapsed from porcelain XY). */
export type ChangeCode = "M" | "A" | "D" | "R" | "U";

export interface ChangeEntry {
	/** Repo-root-relative path (forward slashes). For renames this is the new path. */
	path: string;
	/** Original path for renames. */
	origPath?: string;
	code: ChangeCode;
	/** True when the change is (at least partly) staged in the index. */
	staged: boolean;
}
