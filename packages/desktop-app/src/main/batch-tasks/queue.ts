export async function pLimit<T>(concurrency: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
	if (concurrency <= 0) {
		throw new Error("concurrency must be greater than 0");
	}

	const results: T[] = new Array(tasks.length);
	let index = 0;

	async function worker(): Promise<void> {
		while (index < tasks.length) {
			const currentIndex = index++;
			results[currentIndex] = await tasks[currentIndex]();
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
	await Promise.all(workers);
	return results;
}
