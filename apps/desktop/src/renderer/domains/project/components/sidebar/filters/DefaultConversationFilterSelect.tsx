import type { DefaultConversationFilter } from "@shared/store/atoms";
import { SidebarFilterSelectView } from "@vetta-org/theme-ui/sidebar/SidebarFilterSelectView";
import { useDefaultConversationFilterSelectModel } from "../../../hooks/useDefaultConversationFilterSelectModel";

export function DefaultConversationFilterSelect(): JSX.Element {
	const model = useDefaultConversationFilterSelectModel();
	return (
		<SidebarFilterSelectView
			options={model.options}
			showGridIcon={model.showGridIcon}
			value={model.value}
			onChange={(value) => model.onChange(value as DefaultConversationFilter)}
		/>
	);
}
