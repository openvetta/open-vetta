import { useEffect, useState } from "react";

const TIMEOUT_MS = 2 * 60 * 1000;
const TIMEOUT_SECONDS = TIMEOUT_MS / 1000;

export function useApprovalCountdown(approvalId: string | undefined): string {
	const [remainingSeconds, setRemainingSeconds] = useState(TIMEOUT_SECONDS);

	useEffect(() => {
		setRemainingSeconds(TIMEOUT_SECONDS);
		if (!approvalId) return;

		const deadline = Date.now() + TIMEOUT_MS;
		let timeoutId: ReturnType<typeof setTimeout>;
		const update = (): void => {
			const remainingMs = Math.max(0, deadline - Date.now());
			const seconds = Math.ceil(remainingMs / 1000);
			setRemainingSeconds(seconds);
			if (seconds === 0) return;

			const untilNextSecond = remainingMs - (seconds - 1) * 1000;
			timeoutId = setTimeout(update, Math.max(1, untilNextSecond));
		};
		timeoutId = setTimeout(update, 1000);
		return () => clearTimeout(timeoutId);
	}, [approvalId]);

	const minutes = Math.floor(remainingSeconds / 60);
	const seconds = remainingSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
