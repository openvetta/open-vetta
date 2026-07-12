import { TokenActivityChartView } from "./TokenActivityChartView";
import { useTokenActivityChartModel } from "./useTokenActivityChartModel";

export function TokenActivityChart(): JSX.Element | null {
	const model = useTokenActivityChartModel();
	if (!model) return null;
	return <TokenActivityChartView {...model} />;
}
