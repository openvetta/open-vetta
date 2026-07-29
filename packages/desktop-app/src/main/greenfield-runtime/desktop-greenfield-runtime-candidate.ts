import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
	type GreenfieldRuntimeCompositionOptions,
	resolveGreenfieldSessionIdFromPath,
} from "@vetta/cli-app";
import {
	assessRuntimeHostSessionAssembly,
	type GreenfieldRuntimeSession,
	type RuntimeHostSessionAssemblyAssessment,
} from "../../../../runtime-core/src/index.js";

export type DesktopGreenfieldSessionOptions = Omit<GreenfieldCliSessionOptions, "sessionId"> & {
	readonly sessionId?: string;
};

export interface DesktopGreenfieldSessionCandidate {
	readonly session: GreenfieldRuntimeSession;
	readonly assessment: RuntimeHostSessionAssemblyAssessment;
}

/**
 * Desktop 的非生产 Greenfield 组合。
 *
 * 它复用真实 Greenfield Repository/Factory，但只交付候选 Assembly 和完整性评估；
 * 生产 RuntimeHost 不消费本对象，缺失 Port 也不会被 no-op 掩盖。
 */
export class DesktopGreenfieldRuntimeCandidate {
	constructor(
		private readonly composition: GreenfieldRuntimeComposition,
		private readonly conversationDir: string,
		private readonly cwd: string,
	) {}

	async createSession(options: DesktopGreenfieldSessionOptions = {}): Promise<DesktopGreenfieldSessionCandidate> {
		this.assertWorkspace(options.cwd);
		const session = await this.composition.backend.create({
			...options,
			cwd: this.cwd,
			sessionId: options.sessionId ?? randomUUID(),
		});
		return toCandidate(session);
	}

	async resumeSession(
		sessionPath: string,
		options: Omit<DesktopGreenfieldSessionOptions, "sessionId"> = {},
	): Promise<DesktopGreenfieldSessionCandidate> {
		this.assertWorkspace(options.cwd);
		const sessionId = resolveGreenfieldSessionIdFromPath(this.conversationDir, sessionPath);
		if (!sessionId) throw new Error("Session path is not a Greenfield conversation in this composition");
		const session = await this.composition.backend.resume({
			...options,
			cwd: this.cwd,
			sessionId,
		});
		return toCandidate(session);
	}

	dispose(): Promise<void> {
		return this.composition.dispose();
	}

	private assertWorkspace(cwd: string | undefined): void {
		if (cwd !== undefined && resolve(cwd) !== resolve(this.cwd)) {
			throw new Error("Greenfield candidate session cwd must match its workspace-scoped composition");
		}
	}
}

export async function createDesktopGreenfieldRuntimeCandidate(
	options: GreenfieldRuntimeCompositionOptions,
): Promise<DesktopGreenfieldRuntimeCandidate> {
	const composition = await createGreenfieldRuntimeComposition({
		...options,
		scenario: options.scenario ?? "conversation",
	});
	return new DesktopGreenfieldRuntimeCandidate(composition, options.conversationDir, options.cwd ?? process.cwd());
}

function toCandidate(session: GreenfieldRuntimeSession): DesktopGreenfieldSessionCandidate {
	return {
		session,
		assessment: assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate()),
	};
}
