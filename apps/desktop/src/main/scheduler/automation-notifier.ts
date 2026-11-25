import {
	type AutomationNotification,
	type AutomationNotifyWhen,
	type AutomationTemplateVariable,
	renderAutomationTemplate,
	type ScheduledTask,
	type TaskExecutionRecord,
} from "../../shared/automation.js";
import { mainT } from "../i18n/index.js";
import { getImHost } from "../im-host/index.js";
import { getWebhookManager } from "../webhook/index.js";

/** webhook 单条消息的保守长度：飞书/钉钉文本上限都在数千字符，回复截断到这里。 */
const MAX_REPLY_CHARS = 3000;
/**
 * Claw 网关会按各渠道的单条上限把长文本拆成多条发送，所以不必跟 webhook 一样截到 3000；
 * 只设一个兜底，避免一份超长回复在聊天里刷出几十条消息。
 */
const MAX_CLAW_REPLY_CHARS = 20_000;

type FinishedStatus = "success" | "failed";
type TemplateValues = Readonly<Record<AutomationTemplateVariable, string>>;

function shouldNotify(when: AutomationNotifyWhen, status: FinishedStatus): boolean {
	if (when === "always") return true;
	return when === (status === "success" ? "success" : "failure");
}

function formatDuration(ms: number | undefined): string {
	if (ms === undefined) return "—";
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function truncateReply(reply: string, maxChars: number): string {
	return reply.length > maxChars ? `${reply.slice(0, maxChars)}…` : reply;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function sendToWebhooks(
	task: ScheduledTask,
	notification: AutomationNotification,
	status: FinishedStatus,
	templateValues: TemplateValues,
): Promise<string | undefined> {
	const text = renderAutomationTemplate(notification.template, templateValues);
	try {
		const results = await getWebhookManager().broadcast(
			{ title: task.name, text, level: status === "success" ? "success" : "error" },
			{ onlyIds: [...notification.webhookIds] },
		);
		const failures = results.filter((result) => !result.ok);
		if (results.length === 0) return mainT("automation:notify.noEndpoint");
		return failures.length > 0
			? failures.map((result) => `${result.name}: ${result.error ?? "unknown error"}`).join("; ")
			: undefined;
	} catch (error) {
		return errorMessage(error);
	}
}

/** Claw 不提供文案设置：成功时发回复，失败时发错误。 */
async function sendToClaw(status: FinishedStatus, templateValues: TemplateValues): Promise<string | undefined> {
	const text = mainT(`automation:notify.claw.message.${status}`, templateValues);
	try {
		const failure = await getImHost().deliverAutomationResult(text);
		return failure ? mainT(`automation:notify.claw.${failure.reason}`, { detail: failure.detail ?? "" }) : undefined;
	} catch (error) {
		return mainT("automation:notify.claw.send_failed", { detail: errorMessage(error) });
	}
}

/**
 * 执行结束后按任务配置发 webhook 与 Claw；返回失败说明（全部成功或无需发送时为 undefined）。
 * 通知失败只记进执行记录，不改变执行状态本身。中止的执行不发送。
 */
export async function notifyAutomationFinished(
	task: ScheduledTask,
	record: TaskExecutionRecord,
	reply: string,
): Promise<string | undefined> {
	const status = record.status;
	if (status !== "success" && status !== "failed") return undefined;
	const notification = task.notification;
	const webhookDue = notification !== undefined && shouldNotify(notification.when, status);
	if (!webhookDue && !task.notifyClaw) return undefined;

	const templateValues: TemplateValues = {
		name: task.name,
		status: mainT(`automation:notify.status.${status}`),
		startedAt: new Date(record.startedAt).toLocaleString(),
		duration: formatDuration(record.durationMs),
		reply: truncateReply(reply, MAX_REPLY_CHARS),
		error: record.error ?? "",
	};
	const failures = await Promise.all([
		webhookDue ? sendToWebhooks(task, notification, status, templateValues) : undefined,
		task.notifyClaw
			? sendToClaw(status, { ...templateValues, reply: truncateReply(reply, MAX_CLAW_REPLY_CHARS) })
			: undefined,
	]);
	const failureMessages = failures.filter((failure): failure is string => Boolean(failure));
	return failureMessages.length > 0 ? failureMessages.join("; ") : undefined;
}
