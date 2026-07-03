import { useThemeComponent } from "@vetta/theme-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SkillInfo } from "@preload/api";
import { SlashPanelView } from "./slash-panel/SlashPanelView";
import type { SlashPanelItemModel, SlashPanelProps } from "./slash-panel/types";

const SOURCE_LABEL_KEYS = {
	user: "slashPanel.sourceLabels.user",
	project: "slashPanel.sourceLabels.project",
	path: "slashPanel.sourceLabels.path",
	scene: "slashPanel.sourceLabels.scene",
	"agents-user": "slashPanel.sourceLabels.agentsUser",
	"agents-project": "slashPanel.sourceLabels.agentsProject",
} as const;

export function SlashPanel({
	open,
	onClose,
	onSelect,
	filter,
	placement = "top",
	cwd,
	className,
	classNames,
}: SlashPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);
	const ThemedSlashPanelView = useThemeComponent("chat.slashPanelView", SlashPanelView);

	useEffect(() => {
		if (open) {
			void window.vetta.skills.list(cwd).then(setSkills);
		}
	}, [open, cwd]);

	const normalizedFilter = filter.startsWith("/") ? filter.slice(1) : filter;
	const filtered = useMemo(() => {
		if (!normalizedFilter) return skills;
		const q = normalizedFilter.toLowerCase();
		return skills.filter((s) => s.name.toLowerCase().includes(q) || (s.alias?.toLowerCase().includes(q) ?? false));
	}, [normalizedFilter, skills]);

	const allItems = useMemo(() => {
		const scenes = filtered.filter((s) => s.type === "scene");
		const standardSkills = filtered.filter((s) => s.type !== "scene");
		return [...scenes, ...standardSkills];
	}, [filtered]);

	useEffect(() => {
		setActiveIndex(0);
	}, [filter]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!open || allItems.length === 0) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i + 1) % allItems.length);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex((i) => (i - 1 + allItems.length) % allItems.length);
			} else if (e.key === "Enter" && allItems.length > 0) {
				e.preventDefault();
				e.stopPropagation();
				onSelect(allItems[activeIndex]);
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		},
		[open, allItems, activeIndex, onSelect, onClose],
	);

	useEffect(() => {
		if (open) {
			document.addEventListener("keydown", handleKeyDown, true);
			return () => document.removeEventListener("keydown", handleKeyDown, true);
		}
	}, [open, handleKeyDown]);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClick);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClick);
		};
	}, [open, onClose]);

	useEffect(() => {
		if (!open) return;
		const el = panelRef.current?.querySelector(`[data-index="${activeIndex}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);

	const toItemModel = useCallback(
		(skill: SkillInfo): SlashPanelItemModel => {
			const index = allItems.indexOf(skill);
			const sourceKey = SOURCE_LABEL_KEYS[skill.source as keyof typeof SOURCE_LABEL_KEYS];
			return {
				skill,
				index,
				active: index === activeIndex,
				sourceLabel: sourceKey ? t(sourceKey) : skill.source,
			};
		},
		[activeIndex, allItems, t],
	);

	const scenes = filtered.filter((s) => s.type === "scene").map(toItemModel);
	const standardSkills = filtered.filter((s) => s.type !== "scene").map(toItemModel);

	return (
		<ThemedSlashPanelView
			open={open}
			placement={placement}
			normalizedFilter={normalizedFilter}
			scenes={scenes}
			standardSkills={standardSkills}
			allItemsCount={allItems.length}
			labels={{
				header: t("slashPanel.header"),
				resultCount: t("slashPanel.resultCount", { count: allItems.length }),
				emptyNoMatch: t("slashPanel.emptyNoMatch"),
				emptyNoSkills: t("slashPanel.emptyNoSkills"),
				scenesSection: t("slashPanel.scenesSection"),
				skillsSection: t("slashPanel.skillsSection"),
			}}
			panelRef={panelRef}
			className={className}
			classNames={classNames}
			onHoverItem={setActiveIndex}
			onSelectItem={onSelect}
		/>
	);
}

export type { SlashPanelProps, SlashPanelViewProps } from "./slash-panel/types";
