import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ipcMain } from "electron";

const execAsync = promisify(exec);

const FLOWING_CHANNELS = {
	PACK_FILES: "vetta:flowing:pack-files",
	UNPACK_FILES: "vetta:flowing:unpack-files",
	READ_META: "vetta:flowing:read-meta",
	WRITE_META: "vetta:flowing:write-meta",
	FIND_PROJECT_BY_FLOWING_ID: "vetta:flowing:find-project",
} as const;

export { FLOWING_CHANNELS };

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
			const tmpDir = join(tmpdir(), `vetta-flowing-${randomUUID()}`);
			mkdirSync(tmpDir, { recursive: true });

			// 如果有 message，生成 notice.md
			if (message) {
				let noticeName = "notice.md";
				// 检查冲突
				if (filePaths.includes(noticeName)) {
					let i = 1;
					while (filePaths.includes(`notice_${i}.md`)) i++;
					noticeName = `notice_${i}.md`;
				}
				const now = new Date().toLocaleString("zh-CN");
				const content = `# 流转附言\n\n**发送方**: ${senderName ?? "未知"}\n**时间**: ${now}\n\n---\n\n${message}\n`;
				writeFileSync(join(tmpDir, noticeName), content, "utf-8");
			}

			const zipPath = join(tmpDir, "flowing.zip");
			// 使用 zip 命令行打包
			const quotedFiles = filePaths.map((f) => `"${f}"`).join(" ");
			await execAsync(`cd "${projectDir}" && zip -r "${zipPath}" ${quotedFiles}`, {
				maxBuffer: 512 * 1024 * 1024,
			});

			// 如果有 notice.md，追加到 zip
			if (message) {
				const noticeFiles = readdirSync(tmpDir).filter((f) => f.startsWith("notice"));
				if (noticeFiles.length > 0) {
					const noticeArgs = noticeFiles.map((f) => `"${f}"`).join(" ");
					await execAsync(`cd "${tmpDir}" && zip -g "${zipPath}" ${noticeArgs}`);
				}
			}

			const buffer = readFileSync(zipPath);
			// 清理
			await execAsync(`rm -rf "${tmpDir}"`);
			return buffer.buffer as ArrayBuffer;
		},
	);

	// 解压 zip 到目标目录
	ipcMain.handle(
		FLOWING_CHANNELS.UNPACK_FILES,
		async (_event, zipBuffer: ArrayBuffer, destDir: string): Promise<string[]> => {
			mkdirSync(destDir, { recursive: true });

			const tmpZip = join(tmpdir(), `vetta-flowing-unpack-${randomUUID()}.zip`);
			writeFileSync(tmpZip, Buffer.from(zipBuffer));

			await execAsync(`unzip -o "${tmpZip}" -d "${destDir}"`, {
				maxBuffer: 512 * 1024 * 1024,
			});

			await execAsync(`rm "${tmpZip}"`);

			// 返回解压后的文件列表
			const { stdout } = await execAsync(`find "${destDir}" -type f`);
			return stdout.trim().split("\n").filter(Boolean);
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
		async (_event, flowingId: number, projects: string[]): Promise<string | null> => {
			for (const projectDir of projects) {
				const metaPath = join(projectDir, ".vetta", "meta.json");
				if (!existsSync(metaPath)) continue;
				try {
					const content = readFileSync(metaPath, "utf-8");
					const meta = JSON.parse(content) as Record<string, unknown>;
					if (meta.type === "flowing" && meta.flowingId === flowingId) {
						return projectDir;
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
