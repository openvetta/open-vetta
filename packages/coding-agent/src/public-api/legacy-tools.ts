/** Explicit compatibility surface for Legacy Coding Agent tool characterization. */
export {
	type BackgroundTaskEndedBy,
	type BackgroundTaskEvent,
	type BackgroundTaskListener,
	BackgroundTaskManager,
	type BackgroundTaskSnapshot,
	type BackgroundTaskStatus,
	buildTaskNotification,
} from "../core/background-tasks/index.js";
export {
	createBashTool,
	createEditTool,
	createFindTool,
	createGlobTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createShellTool,
	createTreeTool,
	createWriteTool,
} from "../core/sdk.js";
export { createTaskOutputTool, createTaskStopTool } from "../core/tools/index.js";
