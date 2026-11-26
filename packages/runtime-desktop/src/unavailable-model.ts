import { AI_ERROR_CODES, AIError, type Api, type Model, streamSimple } from "@vetta/ai";
import type { CodingAgentRuntimeCompositionOptions } from "@vetta/coding-agent/composition";

type StreamFn = NonNullable<CodingAgentRuntimeCompositionOptions["streamFn"]>;

/** 占位模型的服务商标识；不会与任何真实服务商重名,宿主据此认出「这个会话眼下没有模型」。 */
export const UNAVAILABLE_MODEL_PROVIDER = "vetta-no-model";
const UNAVAILABLE_MODEL_ID = "unavailable";

export const DEFAULT_UNAVAILABLE_MODEL_MESSAGE =
	"No model is available. Add a model provider in Settings, or connect Vetta in Magpie, then try again.";

/**
 * 一个模型都没有时,恢复已有会话用的占位模型。
 *
 * 打开旧对话只是为了看历史,不该因为没有模型就整个打不开(用户会以为对话丢了)。
 * Session 组装要求必须有一个初始模型,所以给它一个占位;真要发请求时由
 * {@link guardUnavailableModelStream} 拦下来,给出「去配置模型」的明确报错,不会打到任何网络地址。
 */
export function createUnavailableModel(): Model<Api> {
	return {
		id: UNAVAILABLE_MODEL_ID,
		name: "No model available",
		api: "openai-completions",
		provider: UNAVAILABLE_MODEL_PROVIDER,
		baseUrl: "",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 0,
	};
}

export function isUnavailableModel(model: Pick<Model<Api>, "provider"> | undefined): boolean {
	return model?.provider === UNAVAILABLE_MODEL_PROVIDER;
}

/** 让占位模型的任何模型请求(对话、标题生成、压缩)都在发出前失败,报错文案由宿主给,可以本地化。 */
export function guardUnavailableModelStream(
	streamFn: StreamFn | undefined,
	readMessage: () => string = () => DEFAULT_UNAVAILABLE_MODEL_MESSAGE,
): StreamFn {
	const invoke = streamFn ?? streamSimple;
	return (model, context, options) => {
		if (isUnavailableModel(model)) {
			throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, readMessage(), {
				retryable: false,
				provider: model.provider,
				modelId: model.id,
				phase: "resolve",
			});
		}
		return invoke(model, context, options);
	};
}
