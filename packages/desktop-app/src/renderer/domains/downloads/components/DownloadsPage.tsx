import { DownloadsPageView } from "@vetta/theme-ui/downloads";
import { useDownloadsPageModel } from "../hooks/useDownloadsPageModel";

export function DownloadsPage(): JSX.Element {
	const model = useDownloadsPageModel();
	return <DownloadsPageView {...model} />;
}
