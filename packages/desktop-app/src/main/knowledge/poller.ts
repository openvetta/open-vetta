/**
 * 知识库后台惰性加工轮询器。
 *
 * 每 N 分钟（设置可配）跑一轮：工程侧算 raws diff + 处理 moved/孤儿标记，
 * 若有 added/changed/待回收孤儿，则起一个加工 agent 会话（落在
 * processing_records 特殊项目，可在 sidebar 回看），完成后工程侧 n+1 回收孤儿。
 *
 * 攒批：不追求实时，整批变更交给一个会话；同一时刻只跑一轮。
 */

import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentSession,
	type AgentSessionEvent,
	createAgentSession,
	createCodingTools,
	createKbFilterByTagsTool,
	createKbListTagsTool,
	createKbWritePageTool,
	knowledge,
	SessionManager,
} from "@vetta/coding-agent";
import { BrowserWindow } from "electron";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { KB_PROCESSING_CWD, KB_PROCESSING_SESSION_DIR, readDesktopConfig } from "../ipc/fs.js";
import { getAppLogger } from "../logger.js";
import { beginRound, endRound, unlockRaws } from "./raws-lock.js";

/** 加工中状态：广播给渲染层（顶栏「正在建立索引…」徽标）。 */
export const KB_PROCESSING_CHANGED_CHANNEL = "vetta:kb:processing-changed";
let processing = false;

export function isKnowledgeProcessing(): boolean {
	return processing;
}

function setProcessing(next: boolean): void {
	if (processing === next) return;
	processing = next;
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) win.webContents.send(KB_PROCESSING_CHANGED_CHANNEL, next);
	}
}

const log = getAppLogger("kb-poller");
const scheduler = new ToadScheduler();
const JOB_ID = "kb-poller";
let scheduled = false;
let running = false;

async function applyProcessingModel(session: AgentSession, modelKey: string | undefined): Promise<void> {
	if (!modelKey) return;
	const slash = modelKey.indexOf("/");
	if (slash <= 0) return;
	const provider = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	try {
		const model = session.modelRegistry.find(provider, modelId);
		if (model) await session.setModel(model);
		else log.warn(`processing model not found: ${modelKey}`);
	} catch (err) {
		log.warn(`failed to set processing model ${modelKey}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

function waitForCompletion(session: AgentSession, prompt: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			fn();
		};
		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			if (event.type === "agent_end") finish(resolve);
		});
		session.prompt(prompt).catch((err) => finish(() => reject(err)));
	});
}

/** 跑一轮加工。返回是否因无变更而跳过。 */
export async function runKnowledgeRound(modelKey?: string): Promise<{ skipped: boolean }> {
	if (running) {
		log.info("previous round still running, skipping this tick");
		return { skipped: true };
	}
	running = true;
	try {
		const root = knowledge.knowledgeRoot();
		await knowledge.ensureKnowledgeDirs(root);
		const now = new Date().toISOString();
		const prepared = await knowledge.prepareRound(root, now);

		if (knowledge.isEmptyDiff(prepared.diff) && prepared.toReap.length === 0) {
			log.info("no raws changes, nothing to process");
			return { skipped: true };
		}
		// 确有工程/LLM 工作 → 广播「加工中」，渲染层顶栏出「正在建立索引…」徽标。
		setProcessing(true);
		log.info(
			`processing round: +${prepared.diff.added.length} ~${prepared.diff.changed.length} ` +
				`moved=${prepared.diff.moved.length} del=${prepared.diff.deleted.length} reap=${prepared.toReap.length}`,
		);

		// 只有 added/changed 需要 LLM 读原文写 wiki 页。moved（纯元数据）、deleted（标孤儿）、
		// 孤儿回收都是工程侧动作（prepareRound/finalizeRound 处理），不起 LLM、不耗 token。
		if (knowledge.diffNeedsProcessing(prepared.diff)) {
			// 每轮一个 OS tmp 私有目录：注入 TMPDIR/TEMP/TMP 让工具子进程的临时文件
			// 落到这里，并在 prompt 中指引 agent 把中间产物写进来，避免污染 raws/。
			const tmpDir = join(tmpdir(), `vetta-kb-${randomUUID()}`);
			await mkdir(tmpDir, { recursive: true });

			// 加工期间把 raws/ 整树锁成只读（OS 强制），绝对杜绝 agent 往 raws 写入。
			// 走 beginRound/endRound（互斥），与 UI 特权写串行，UI 写仍可在轮次中穿插。
			await beginRound(root);
			try {
				const tools = [
					...createCodingTools(KB_PROCESSING_CWD),
					createKbWritePageTool(),
					createKbFilterByTagsTool(),
					createKbListTagsTool(),
				];
				const { session } = await createAgentSession({
					cwd: KB_PROCESSING_CWD,
					sessionManager: SessionManager.create(KB_PROCESSING_CWD, KB_PROCESSING_SESSION_DIR),
					tools,
					appendSystemPrompt: knowledge.KB_PROCESSING_GUIDE,
					enableBackgroundTasks: false,
					env: { TMPDIR: tmpDir, TEMP: tmpDir, TMP: tmpDir },
				});
				try {
					await applyProcessingModel(session, modelKey);
					await waitForCompletion(session, knowledge.buildProcessingPrompt(prepared.diff, root, tmpDir));
				} finally {
					session.dispose();
				}
			} finally {
				await endRound(root);
				await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
			}
		} else {
			log.info("engineering-only round (moved/deleted/orphan reap), skipping LLM");
		}

		// 工程侧收尾：物理删除上一轮孤儿（不经 agent）+ 据 frontmatter 重建缓存。
		await knowledge.finalizeRound(root, prepared.toReap);
		log.info("processing round complete");
		return { skipped: false };
	} finally {
		setProcessing(false);
		running = false;
	}
}

function unschedule(): void {
	if (scheduled) {
		scheduler.removeById(JOB_ID);
		scheduled = false;
	}
}

/** 据当前配置（重新）调度轮询器。配置变化或启动时调用。 */
export async function reloadKnowledgePoller(): Promise<void> {
	unschedule();
	// 自愈：清除上次进程崩溃可能残留的 raws 只读锁。
	// 仅当无加工轮进行时才清——进行中那一轮的锁是「活动锁」不是残留，
	// 误清会丢掉防 agent 污染 raws 的 OS 兜底（如用户正加工时保存了知识库设置）。
	if (!running) await unlockRaws().catch(() => {});
	const config = await readDesktopConfig();
	const kb = config.knowledgeBase;
	// 总开关：关闭时置 env 标志，coding-agent 据此对 agent 屏蔽知识库检索工具。
	process.env.VETTA_KNOWLEDGE_DISABLED = kb?.enabled === false ? "1" : "";
	if (!kb?.enabled) {
		log.info("knowledge base disabled");
		return;
	}
	// 启动/改设置时自愈一次：据 frontmatter 重建缓存，覆盖缓存缺失/损坏/手改场景，
	// 用户无需任何手动「重建」操作。无 LLM、O(N)、隐形。加工轮进行中则跳过避免竞态。
	if (!running) {
		const root = knowledge.knowledgeRoot();
		await knowledge.ensureKnowledgeDirs(root);
		await knowledge
			.rebuildAllCaches(root)
			.catch((err) => log.warn(`self-heal rebuild failed: ${err instanceof Error ? err.message : String(err)}`));
	}
	const minutes = kb.pollIntervalMinutes ?? 5;
	const modelKey = kb.processingModelKey;
	const task = new AsyncTask(
		JOB_ID,
		async () => {
			await runKnowledgeRound(modelKey);
		},
		(err: Error) => log.error(`knowledge round failed: ${err.message}`),
	);
	scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ minutes, runImmediately: false }, task, { id: JOB_ID }));
	scheduled = true;
	log.info(`knowledge poller scheduled every ${minutes} min`);
}

export function stopKnowledgePoller(): void {
	unschedule();
	scheduler.stop();
}
