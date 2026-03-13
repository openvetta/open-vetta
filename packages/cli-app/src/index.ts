import { main } from "@vetta/coding-agent";

export async function runCli(argv: string[]): Promise<void> {
	await main(argv);
}
