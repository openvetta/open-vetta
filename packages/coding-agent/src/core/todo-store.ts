/** @deprecated 旧 Core Tool 的类型兼容入口；会话运行时使用 work-state。 */
export {
	TODO_SNAPSHOT_TYPE,
	type TodoItem,
	type TodoLockSource,
	type TodoSnapshot,
	type TodoSnapshotEnvelope,
	TodoState as TodoStore,
	type TodoUpdateListener,
} from "../work-state/index.js";
