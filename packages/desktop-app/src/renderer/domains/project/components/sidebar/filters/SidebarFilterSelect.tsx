import { useAtom } from "jotai";
import {
	defaultConversationFilterAtom,
	sidebarFilterAtom,
	type DefaultConversationFilter,
	type SidebarFilter,
} from "@shared/store/atoms";
import { FilterSelectPopover } from "./FilterSelectPopover";
import type { DefaultConversationFilterOption, SidebarFilterOption } from "./types";

// label 在渲染期由 t(labelKey) 解析（模块级常量不存中文）。
const FILTER_OPTIONS = [
	{ value: "all", labelKey: "filterTabs.all" },
	{ value: "normal", labelKey: "filterTabs.normal" },
	{ value: "batch", labelKey: "filterTabs.batch" },
	{ value: "flowing", labelKey: "filterTabs.flowing" },
] as const satisfies readonly SidebarFilterOption[];

export function SidebarFilterSelect(): JSX.Element {
	const [filter, setFilter] = useAtom(sidebarFilterAtom);
	const current = FILTER_OPTIONS.find((option) => option.value === filter) ?? FILTER_OPTIONS[0];

	return (
		<FilterSelectPopover<SidebarFilter>
			current={current}
			onChange={setFilter}
			options={FILTER_OPTIONS}
			showGridIcon
			value={filter}
		/>
	);
}

const DEFAULT_CONVERSATION_FILTER_OPTIONS = [
	{ value: "conversation", labelKey: "filterTabs.conversation" },
	{ value: "claw", labelKey: "filterTabs.claw" },
] as const satisfies readonly DefaultConversationFilterOption[];

export function DefaultConversationFilterSelect(): JSX.Element {
	const [filter, setFilter] = useAtom(defaultConversationFilterAtom);
	const current =
		DEFAULT_CONVERSATION_FILTER_OPTIONS.find((option) => option.value === filter) ??
		DEFAULT_CONVERSATION_FILTER_OPTIONS[0];

	return (
		<FilterSelectPopover<DefaultConversationFilter>
			current={current}
			onChange={setFilter}
			options={DEFAULT_CONVERSATION_FILTER_OPTIONS}
			value={filter}
		/>
	);
}
