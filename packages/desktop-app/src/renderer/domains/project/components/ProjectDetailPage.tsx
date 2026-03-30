import { useParams } from "@tanstack/react-router";

export function ProjectDetailPage(): JSX.Element {
	const { cwd } = useParams({ strict: false }) as { cwd: string };
	const decodedCwd = decodeURIComponent(cwd);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
			<span className="icon-[mdi--folder-cog-outline] h-12 w-12 text-muted-foreground" />
			<div className="space-y-1">
				<h2 className="text-lg font-semibold text-foreground">项目详情</h2>
				<p className="text-sm text-muted-foreground">{decodedCwd}</p>
			</div>
			<p className="text-sm text-muted-foreground">开发中</p>
		</div>
	);
}
