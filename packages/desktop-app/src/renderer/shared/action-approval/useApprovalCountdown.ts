import { useEffect, useState } from "react";

const TIMEOUT_MS = 2 * 60 * 1000;

export function useApprovalCountdown(): string {
	const [remaining, setRemaining] = useState(TIMEOUT_MS);

	useEffect(() => {
		const start = Date.now();
		const id = setInterval(() => {
			const left = Math.max(0, TIMEOUT_MS - (Date.now() - start));
			setRemaining(left);
			if (left <= 0) clearInterval(id);
		}, 1000);
		return () => clearInterval(id);
	}, []);

	const minutes = Math.floor(remaining / 60000);
	const seconds = Math.floor((remaining % 60000) / 1000);
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
