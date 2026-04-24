export async function pLimit<T>(concurrency: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
	if (concurrency <= 0) {
		throw new Error("concurrency must be greater than 0");
	}
	console.log(`[BatchTaskQueue] pLimit started: concurrency=${concurrency}, tasks=${tasks.length}`);

	const results: T[] = new Array(tasks.length);
	// index++ 是同步操作，在单线程事件循环中安全；不要改为异步获取
	let index = 0;

	async function worker(): Promise<void> {
		while (index < tasks.length) {
			const currentIndex = index++;
			const start = Date.now();
			results[currentIndex] = await tasks[currentIndex]();
			console.log(
				`[BatchTaskQueue] Worker finished task ${currentIndex + 1}/${tasks.length} in ${Date.now() - start}ms`,
			);
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
	await Promise.all(workers);
	console.log(`[BatchTaskQueue] pLimit finished: all ${tasks.length} tasks completed`);
	return results;
}
