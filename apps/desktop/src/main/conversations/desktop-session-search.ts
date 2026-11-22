import type { WebContents } from "electron";
import { SESSION_SEARCH_CHANNELS } from "../../shared/session-search.js";
import { getSharedRuntime } from "../runtime.js";
import { onConversationListChanged } from "./conversation-list-events.js";
import { resolveDesktopRuntimeSessionRoots } from "./session-catalog-roots.js";
import { readSessionCwdFromHeader } from "./session-paths.js";
import { SessionSearchController } from "./session-search-controller.js";
import { listDesktopSessionSearchSources, narrowSessionSearchSources } from "./session-search-sources.js";
import { SessionSearchWorkerClient } from "./session-search-worker-client.js";

const worker = new SessionSearchWorkerClient();
onConversationListChanged(() => worker.invalidate());

export const desktopSessionSearch = new SessionSearchController({
	send: (owner, event) => (owner as WebContents).send(SESSION_SEARCH_CHANNELS.event, event),
	run: async (requestId, request, emit, signal) => {
		const allSources = await listDesktopSessionSearchSources();
		signal.throwIfAborted();
		// 空查询只列 activePaths 时，先按会话头的 cwd 把来源收窄，避免解析无关项目的全部会话。
		const sources =
			!request.query && request.activePaths?.length
				? narrowSessionSearchSources(
						allSources,
						await Promise.all(
							request.activePaths.map((path) => readSessionCwdFromHeader(path).catch(() => undefined)),
						),
					)
				: allSources;
		signal.throwIfAborted();
		// 空查询只在有「进行中」会话要列出时才进 worker，否则只回 sources 就结束。
		const needsWorker = Boolean(request.query) || Boolean(request.activePaths?.length);
		emit({ requestId, sources: allSources.map(({ cwd, kind, name }) => ({ cwd, kind, name })), done: !needsWorker });
		if (!needsWorker) return;
		await new Promise<void>((done, reject) => {
			let chain = Promise.resolve();
			const cancel = worker.start(
				{ type: "start", requestId, request, sources, roots: resolveDesktopRuntimeSessionRoots() },
				(event) => {
					// Access checks are owned by the live Runtime, and must finish before the terminal event.
					chain = chain
						.then(async () => {
							if (signal.aborted) return;
							// 一批结果的权限检查互不依赖，并行做；保持原有顺序。
							const checked = await Promise.all(
								(event.results ?? []).map(async (result) => {
									const access = await getSharedRuntime().resolveSessionAccess(result.session.path);
									return access?.readHistory
										? { ...result, session: { ...result.session, access } }
										: undefined;
								}),
							);
							const results = checked.filter((result) => result !== undefined);
							if (!signal.aborted) emit({ ...event, results });
							if (event.done) {
								signal.removeEventListener("abort", abort);
								done();
							}
						})
						.catch((error: unknown) => {
							cancel();
							signal.removeEventListener("abort", abort);
							reject(error);
						});
				},
			);
			const abort = () => {
				cancel();
				done();
			};
			signal.addEventListener("abort", abort, { once: true });
		});
	},
});
