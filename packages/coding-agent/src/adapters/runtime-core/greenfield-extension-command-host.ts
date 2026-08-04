import type { ExtensionRunner } from "../../core/extensions/runner.js";
import type { SlashCommandInfo } from "../../core/slash-commands.js";
import type { ExtensionCommandContextActions } from "../../extensions/index.js";

export interface CodingAgentGreenfieldExtensionCommandHostOptions {
	readonly runner: ExtensionRunner;
	readonly actions: ExtensionCommandContextActions;
}

/**
 * Extension slash command 的 Greenfield 执行边界。
 *
 * 命令发现、文本解析、错误上报和队列限制保持 Legacy 语义；会话切换等产品动作
 * 由外层宿主显式注入，缺少完整动作合同时不能构造本宿主。
 */
export class CodingAgentGreenfieldExtensionCommandHost {
	constructor(private readonly options: CodingAgentGreenfieldExtensionCommandHostOptions) {
		options.runner.bindCommandContext(options.actions);
	}

	readCommands(): readonly SlashCommandInfo[] {
		return this.options.runner.getRegisteredCommandsWithPaths().map(({ command, extensionPath }) => ({
			name: command.name,
			description: command.description,
			source: "extension",
			path: extensionPath,
		}));
	}

	async tryExecute(text: string): Promise<boolean> {
		const commandName = readCommandName(text);
		if (commandName === undefined) return false;
		const command = this.options.runner.getCommand(commandName);
		if (!command) return false;

		const spaceIndex = text.indexOf(" ");
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
		try {
			await command.handler(args, this.options.runner.createCommandContext());
		} catch (error) {
			this.options.runner.emitError({
				extensionPath: `command:${commandName}`,
				event: "command",
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return true;
	}

	throwIfExtensionCommand(text: string): void {
		const commandName = readCommandName(text);
		if (commandName === undefined || !this.options.runner.getCommand(commandName)) return;
		throw new Error(
			`Extension command "/${commandName}" cannot be queued. Use prompt() or execute the command when not streaming.`,
		);
	}
}

function readCommandName(text: string): string | undefined {
	if (!text.startsWith("/")) return undefined;
	const spaceIndex = text.indexOf(" ");
	return spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
}
