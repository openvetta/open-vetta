import { useEffect, useState } from "react";

/** Tick once per second while the tool is still running, so the live duration updates. */
export function useElapsedWhilePending(startedAt: number | undefined, pending: boolean): number | null {
	const now = useNowWhilePending(pending && startedAt !== undefined);
	if (startedAt === undefined) return null;
	return Math.max(0, now - startedAt);
}

/** Shared one-second clock for any indicator that must notice a lack of progress. */
export function useNowWhilePending(pending: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!pending) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [pending]);
	return now;
}
