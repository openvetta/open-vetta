import { JourneyPanelView } from "@vetta/theme-ui/activity";
import { useJourneyPanelModel } from "../hooks/useJourneyPanelModel";

interface JourneyPanelProps {
	cwd: string;
}

export function JourneyPanel({ cwd }: JourneyPanelProps): JSX.Element {
	const model = useJourneyPanelModel(cwd);
	return <JourneyPanelView {...model} />;
}
