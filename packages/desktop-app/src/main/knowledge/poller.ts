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
	createFilterByTagsTool,
	createKbWritePageTool,
	knowledge,
	SessionManager,
} from "@vetta/coding-agent";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { KB_PROCESSING_CWD, KB_PROCESSING_SESSION_DIR, readDesktopConfig } from "../ipc/fs.js";
import { getAppLogger } from "../logger.js";

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
		log.info(
			`processing round: +${prepared.diff.added.length} ~${prepared.diff.changed.length} ` +
				`moved=${prepared.diff.moved.length} del=${prepared.diff.deleted.length} reap=${prepared.toReap.length}`,
		);

		// 每轮一个 OS tmp 私有目录：注入 TMPDIR/TEMP/TMP 让工具子进程的临时文件
		// 落到这里，并在 prompt 中指引 agent 把中间产物写进来，避免污染 raws/。
		const tmpDir = join(tmpdir(), `vetta-kb-${randomUUID()}`);
		await mkdir(tmpDir, { recursive: true });

		const tools = [...createCodingTools(KB_PROCESSING_CWD), createKbWritePageTool(), createFilterByTagsTool()];
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
			await waitForCompletion(session, knowledge.buildProcessingPrompt(prepared.diff, prepared.toReap, tmpDir));
		} finally {
			session.dispose();
			await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		}

		await knowledge.finalizeRound(root, prepared.toReap);
		log.info("processing round complete");
		return { skipped: false };
	} finally {
		running = false;
	}
}

/** 手动重建 tags.json / manifest.json 缓存。 */
export async function rebuildKnowledgeIndex(): Promise<void> {
	const root = knowledge.knowledgeRoot();
	await knowledge.ensureKnowledgeDirs(root);
	await knowledge.rebuildAllCaches(root);
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
	const config = await readDesktopConfig();
	const kb = config.knowledgeBase;
	if (!kb?.enabled) {
		log.info("knowledge base processing disabled");
		return;
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
