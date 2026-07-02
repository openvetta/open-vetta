import { useEffect, useRef, useState } from "react";
import type { SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";

interface DefaultSessionRenameInputProps {
	onDone: () => void;
	onRename: (name: string) => void;
	session: SessionInfo;
}

export function DefaultSessionRenameInput({
	onDone,
	onRename,
	session,
}: DefaultSessionRenameInputProps): JSX.Element {
	const [value, setValue] = useState(sessionDisplayLabel(session));
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function commit(): void {
		const trimmed = value.trim();
		if (trimmed && trimmed !== sessionDisplayLabel(session)) {
			onRename(trimmed);
		}
		onDone();
	}

	return (
		<input
			ref={inputRef}
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") commit();
				if (event.key === "Escape") onDone();
			}}
			className="min-w-0 flex-1 truncate rounded-[3px] border border-input bg-accent/50 text-[13px] text-foreground outline-none"
		/>
	);
}
