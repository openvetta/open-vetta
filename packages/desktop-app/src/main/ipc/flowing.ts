import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import AdmZip from "adm-zip";
import { ipcMain } from "electron";
import type { ProjectEntry } from "./fs.js";

const FLOWING_CHANNELS = {
	PACK_FILES: "vetta:flowing:pack-files",
	UNPACK_FILES: "vetta:flowing:unpack-files",
	READ_META: "vetta:flowing:read-meta",
	WRITE_META: "vetta:flowing:write-meta",
	FIND_PROJECT_BY_FLOWING_ID: "vetta:flowing:find-project",
} as const;

export { FLOWING_CHANNELS };

/** Recursively collect all files under a directory */
function collectFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectFiles(fullPath));
		} else {
			results.push(fullPath);
		}
	}
	return results;
}

export function registerFlowingIpc(): () => void {
	// 打包文件为 zip（ArrayBuffer）
	ipcMain.handle(
		FLOWING_CHANNELS.PACK_FILES,
		async (
			_event,
			projectDir: string,
			filePaths: string[],
			message?: string,
			senderName?: string,
		): Promise<ArrayBuffer> => {
			const zip = new AdmZip();

			// 添加文件/目录到 zip
			for (const filePath of filePaths) {
				const fullPath = isAbsolute(filePath) ? filePath : join(projectDir, filePath);
				const stat = statSync(fullPath);
				if (stat.isDirectory()) {
					// 递归添加目录中的所有文件
					const files = collectFiles(fullPath);
					for (const file of files) {
						const entryName = relative(projectDir, file);
						zip.addLocalFile(file, relative(projectDir, join(file, "..")), undefined);
						void entryName; // keep linter happy
					}
				} else {
					const dir = relative(projectDir, join(fullPath, ".."));
					zip.addLocalFile(fullPath, dir === "." ? "" : dir);
				}
			}

			// 如果有 message，生成 notice.md
			if (message) {
				let noticeName = "notice.md";
				if (filePaths.includes(noticeName)) {
					let i = 1;
					while (filePaths.includes(`notice_${i}.md`)) i++;
					noticeName = `notice_${i}.md`;
				}
				const now = new Date().toLocaleString("zh-CN");
				const content = `# 流转附言\n\n**发送方**: ${senderName ?? "未知"}\n**时间**: ${now}\n\n---\n\n${message}\n`;
				zip.addFile(noticeName, Buffer.from(content, "utf-8"));
			}

			const buffer = zip.toBuffer();
			return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
		},
	);

	// 解压 zip 到目标目录
	ipcMain.handle(
		FLOWING_CHANNELS.UNPACK_FILES,
		async (_event, zipBuffer: ArrayBuffer, destDir: string): Promise<string[]> => {
			mkdirSync(destDir, { recursive: true });

			const zip = new AdmZip(Buffer.from(zipBuffer));
			zip.extractAllTo(destDir, true);

			// 返回解压后的文件列表
			return collectFiles(destDir).map((f) => relative(destDir, f));
		},
	);

	// 读取 .vetta/meta.json
	ipcMain.handle(
		FLOWING_CHANNELS.READ_META,
		async (_event, projectDir: string): Promise<Record<string, unknown> | null> => {
			const metaPath = join(projectDir, ".vetta", "meta.json");
			if (!existsSync(metaPath)) return null;
			const content = readFileSync(metaPath, "utf-8");
			return JSON.parse(content) as Record<string, unknown>;
		},
	);

	// 写入 .vetta/meta.json
	ipcMain.handle(
		FLOWING_CHANNELS.WRITE_META,
		async (_event, projectDir: string, meta: Record<string, unknown>): Promise<void> => {
			const vettaDir = join(projectDir, ".vetta");
			mkdirSync(vettaDir, { recursive: true });
			writeFileSync(join(vettaDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
		},
	);

	// 从 desktop-config 中查找匹配 flowingId 的项目
	ipcMain.handle(
		FLOWING_CHANNELS.FIND_PROJECT_BY_FLOWING_ID,
		async (_event, flowingId: number, projects: ProjectEntry[]): Promise<string | null> => {
			for (const project of projects) {
				const metaPath = join(project.path, ".vetta", "meta.json");
				if (!existsSync(metaPath)) continue;
				try {
					const content = readFileSync(metaPath, "utf-8");
					const meta = JSON.parse(content) as Record<string, unknown>;
					if (meta.type === "flowing" && meta.flowingId === flowingId) {
						return project.path;
					}
				} catch {
					// ignore
				}
			}
			return null;
		},
	);

	return () => {
		ipcMain.removeHandler(FLOWING_CHANNELS.PACK_FILES);
		ipcMain.removeHandler(FLOWING_CHANNELS.UNPACK_FILES);
		ipcMain.removeHandler(FLOWING_CHANNELS.READ_META);
		ipcMain.removeHandler(FLOWING_CHANNELS.WRITE_META);
		ipcMain.removeHandler(FLOWING_CHANNELS.FIND_PROJECT_BY_FLOWING_ID);
	};
}
