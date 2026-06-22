/**
 * raws 目录读写锁：加工期间把 raws/ 整树设为只读（OS 级强制），
 * 任何方式（bash / 写工具 / 子进程）往里写文件都会失败，绝对杜绝污染。
 *
 * 仅 POSIX（macOS / Linux）有效——目录去掉写位即禁止在其中 create/rename/delete。
 * Windows 的只读属性不阻止在目录内建文件，故跳过（不做无效操作）。
 */

import type { Dirent } from "node:fs";
import { chmod, readdir } from "node:fs/promises";
import { join } from "node:path";
import { knowledge } from "@vetta/coding-agent";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("kb-raws-lock");
const isPosix = process.platform !== "win32";

// 锁定：目录 r-x（0o555），文件 r--（0o444）。解锁：目录 0o755，文件 0o644。
const LOCK_DIR = 0o555;
const LOCK_FILE = 0o444;
const UNLOCK_DIR = 0o755;
const UNLOCK_FILE = 0o644;

async function chmodTree(dir: string, dirMode: number, fileMode: number): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return; // 目录不存在等，静默
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			await chmodTree(full, dirMode, fileMode);
		} else if (entry.isFile()) {
			await chmod(full, fileMode).catch(() => {});
		}
	}
	await chmod(dir, dirMode).catch(() => {});
}

/** 把 raws/ 整树设为只读。无效平台或目录不存在则 no-op。 */
export async function lockRaws(root?: string): Promise<void> {
	if (!isPosix) {
		log.warn("raws read-only lock skipped: not effective on Windows");
		return;
	}
	const dir = knowledge.rawsDir(knowledge.knowledgeRoot(root));
	await chmodTree(dir, LOCK_DIR, LOCK_FILE);
}

/** 恢复 raws/ 整树为可写。幂等，可在启动时自愈调用。 */
export async function unlockRaws(root?: string): Promise<void> {
	if (!isPosix) return;
	const dir = knowledge.rawsDir(knowledge.knowledgeRoot(root));
	await chmodTree(dir, UNLOCK_DIR, UNLOCK_FILE);
}
