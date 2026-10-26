/**
 * 设计包里 direction.json 的读写。vetd_direction 与截图机检共用这一处，免得两边各自
 * 拼路径、各自决定读不到时怎么办。
 */
import type { PluginFsApi } from "@vetta-org/plugin-sdk";
import type { SourceIssue } from "../vetd/check-sources";
import {
	DIRECTION_FILE,
	type DirectionRecord,
	type DirectionTells,
	directionIssues,
	parseDirectionRecord,
	serializeDirectionRecord,
	tellsFor,
} from "./record";

const pathOf = (dirPath: string) => `${dirPath}/${DIRECTION_FILE}`;

/** 没有、读不了或结构不对，一律当作没发过方向。 */
export async function readDirectionRecord(fs: PluginFsApi, dirPath: string): Promise<DirectionRecord | null> {
	const found = await fs.readFile(pathOf(dirPath)).catch(() => null);
	return found ? parseDirectionRecord(found.content) : null;
}

export function writeDirectionRecord(fs: PluginFsApi, dirPath: string, record: DirectionRecord): Promise<void> {
	return fs.writeFile(pathOf(dirPath), serializeDirectionRecord(record));
}

export async function readDirectionTells(fs: PluginFsApi, dirPath: string): Promise<DirectionTells | null> {
	return tellsFor(await readDirectionRecord(fs, dirPath));
}

export async function readDirectionIssues(fs: PluginFsApi, dirPath: string): Promise<SourceIssue[]> {
	return directionIssues(await readDirectionRecord(fs, dirPath));
}
