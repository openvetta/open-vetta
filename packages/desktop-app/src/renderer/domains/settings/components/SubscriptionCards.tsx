import { SubscriptionCardsView } from "./SubscriptionCardsView";
import { useSubscriptionCardsModel } from "./useSubscriptionCardsModel";

export function SubscriptionCards(): JSX.Element | null {
	const model = useSubscriptionCardsModel();
	return <SubscriptionCardsView model={model} />;
}
