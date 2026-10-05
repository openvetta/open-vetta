import { useCallback, useEffect, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface InstructionsState {
	cwd: string;
	attempt: number;
	content: string;
	original: string;
	loading: boolean;
	loadError: boolean;
	saveStatus: SaveStatus;
}

interface RequestScope {
	cwd: string;
	active: boolean;
	saving: boolean;
	statusTimer?: ReturnType<typeof setTimeout>;
}

function initialState(cwd: string, attempt: number): InstructionsState {
	return { cwd, attempt, content: "", original: "", loading: true, loadError: false, saveStatus: "idle" };
}

/** File reads, writes and feedback belong to the project that started them. */
export function useProjectInstructions(cwd: string) {
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<InstructionsState>(() => initialState(cwd, attempt));
	const scopeRef = useRef<RequestScope | null>(null);
	const current = state.cwd === cwd && state.attempt === attempt ? state : initialState(cwd, attempt);
	const filePath = `${cwd}/AGENTS.md`;

	useEffect(() => {
		const scope: RequestScope = { cwd, active: true, saving: false };
		scopeRef.current = scope;
		setState(initialState(cwd, attempt));
		void window.vetta.fs.readFile(filePath).then(
			(result) => {
				if (!scope.active) return;
				setState({
					...initialState(cwd, attempt),
					content: result.content,
					original: result.content,
					loading: false,
				});
			},
			() => {
				if (scope.active) setState({ ...initialState(cwd, attempt), loading: false, loadError: true });
			},
		);
		return () => {
			scope.active = false;
			clearTimeout(scope.statusTimer);
		};
	}, [cwd, filePath, attempt]);

	const reload = useCallback(() => setAttempt((previous) => previous + 1), []);

	const setContent = useCallback(
		(content: string) => {
			clearTimeout(scopeRef.current?.statusTimer);
			setState((previous) =>
				previous.cwd === cwd && previous.attempt === attempt && !previous.loading && !previous.loadError
					? { ...previous, content, saveStatus: previous.saveStatus === "saving" ? "saving" : "idle" }
					: previous,
			);
		},
		[cwd, attempt],
	);

	const save = useCallback(async () => {
		const scope = scopeRef.current;
		if (
			!scope?.active ||
			scope.cwd !== cwd ||
			scope.saving ||
			state.cwd !== cwd ||
			state.attempt !== attempt ||
			state.loading ||
			state.loadError ||
			state.content === state.original
		)
			return;
		const content = state.content;
		scope.saving = true;
		clearTimeout(scope.statusTimer);
		setState((previous) => ({ ...previous, saveStatus: "saving" }));
		try {
			await window.vetta.fs.writeFile(filePath, content);
			if (!scope.active) return;
			setState((previous) => ({
				...previous,
				original: content,
				saveStatus: previous.content === content ? "saved" : "idle",
			}));
			scope.statusTimer = setTimeout(() => {
				if (scope.active) setState((previous) => ({ ...previous, saveStatus: "idle" }));
			}, 2000);
		} catch {
			if (scope.active) setState((previous) => ({ ...previous, saveStatus: "error" }));
		} finally {
			scope.saving = false;
		}
	}, [cwd, filePath, state, attempt]);

	return {
		content: current.content,
		setContent,
		loading: current.loading,
		loadError: current.loadError,
		reload,
		save,
		saveStatus: current.saveStatus,
		isDirty: current.content !== current.original,
	};
}
