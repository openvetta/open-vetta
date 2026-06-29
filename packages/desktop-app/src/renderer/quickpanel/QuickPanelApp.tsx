import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useQuickPanelTranslation } from "./i18n";
import { RecentList } from "./RecentList";
import { useQuickPanelSessions, type QuickPanelItem } from "./useQuickPanelSessions";

export function QuickPanelApp(): JSX.Element {
	const t = useQuickPanelTranslation();
	const items = useQuickPanelSessions();
	const [input, setInput] = useState("");
	// 高亮行：0 = 输入行（Raycast row 0），1..N = 列表项。
	const [highlight, setHighlight] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// 列表项数量变化时夹紧高亮，避免指向已消失的行。
	useEffect(() => {
		setHighlight((h) => Math.min(h, items.length));
	}, [items.length]);

	// 面板每次被唤出：清空输入、复位高亮到输入行、重新聚焦输入框。
	useEffect(() => {
		const bridge = window.vettaQuickPanel;
		inputRef.current?.focus();
		if (!bridge) return;
		return bridge.onShown(() => {
			setInput("");
			setHighlight(0);
			requestAnimationFrame(() => inputRef.current?.focus());
		});
	}, []);

	const submitNew = useCallback(() => {
		const text = input.trim();
		if (!text) return;
		void window.vettaQuickPanel?.createConversation(text);
	}, [input]);

	const openItem = useCallback((item: QuickPanelItem) => {
		void window.vettaQuickPanel?.openSession({ sessionPath: item.sessionPath, cwd: item.cwd });
	}, []);

	const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setInput(event.target.value);
		// 输入即回到输入行（Raycast：打字始终停在 row 0）。
		setHighlight(0);
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					setHighlight((h) => Math.min(h + 1, items.length));
					break;
				case "ArrowUp":
					event.preventDefault();
					setHighlight((h) => Math.max(h - 1, 0));
					break;
				case "Enter": {
					event.preventDefault();
					if (highlight === 0) {
						submitNew();
					} else {
						const target = items[highlight - 1];
						if (target) openItem(target);
					}
					break;
				}
				case "Escape":
					event.preventDefault();
					window.vettaQuickPanel?.hide();
					break;
				default:
					break;
			}
		},
		[items, highlight, submitNew, openItem],
	);

	return (
		<div className="flex h-screen w-screen items-stretch justify-center bg-transparent p-2" onKeyDown={handleKeyDown}>
			<div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-2xl">
				<div className="flex items-center gap-2.5 px-4">
					<span className="icon-[solar--magnifer-linear] h-[18px] w-[18px] shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						value={input}
						onChange={handleChange}
						onFocus={() => setHighlight(0)}
						placeholder={t("placeholder")}
						spellCheck={false}
						autoComplete="off"
						className="quickpanel-input h-14 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
					/>
				</div>
				<div className="h-px shrink-0 bg-border/60" />
				<RecentList
					items={items}
					highlight={highlight}
					onHover={(index) => setHighlight(index + 1)}
					onSelect={openItem}
				/>
			</div>
		</div>
	);
}
