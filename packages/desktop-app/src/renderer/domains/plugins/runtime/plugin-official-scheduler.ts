import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialSchedulerApi(assertOfficial: () => void): PluginOfficialApi["scheduler"] {
	return {
		listTasks: async () => {
			assertOfficial();
			return window.vetta.scheduler.getTasks();
		},
		getTask: async (taskId) => {
			assertOfficial();
			const task = (await window.vetta.scheduler.getTasks()).find((item) => item.id === taskId);
			if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
			return task;
		},
		listTaskIds: async () => {
			assertOfficial();
			return (await window.vetta.scheduler.getTasks()).map((item) => item.id);
		},
		getHistory: async (taskId) => {
			assertOfficial();
			return window.vetta.scheduler.getRecords(taskId);
		},
		createTask: async (data) => {
			assertOfficial();
			return window.vetta.scheduler.createTask({ ...data, enabled: data.enabled ?? true });
		},
		updateTask: async (taskId, data) => {
			assertOfficial();
			const { modelKey, skill, ...rest } = data;
			const patch = {
				...rest,
				...("modelKey" in data ? { modelKey: modelKey ?? undefined } : {}),
				...("skill" in data ? { skill: skill ?? undefined } : {}),
			};
			await window.vetta.scheduler.updateTask(taskId, patch);
			const task = (await window.vetta.scheduler.getTasks()).find((item) => item.id === taskId);
			if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
			return task;
		},
		deleteTask: async (taskId) => {
			assertOfficial();
			await window.vetta.scheduler.deleteTask(taskId);
			return { taskId, operation: "delete" };
		},
		setEnabled: async (taskId, enabled) => {
			assertOfficial();
			if (enabled) await window.vetta.scheduler.updateTask(taskId, { enabled: true });
			else await window.vetta.scheduler.disableTask(taskId);
			const task = (await window.vetta.scheduler.getTasks()).find((item) => item.id === taskId);
			if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
			return task;
		},
		runNow: async (taskId) => {
			assertOfficial();
			await window.vetta.scheduler.runTaskNow(taskId);
			return { taskId, operation: "run-now" };
		},
		abort: async (taskId) => {
			assertOfficial();
			await window.vetta.scheduler.abortTask(taskId);
			return { taskId, operation: "abort" };
		},
	};
}
