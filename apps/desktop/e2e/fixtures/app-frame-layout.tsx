import { AppFrame } from "@vetta-org/theme-ui/layout/AppFrame";
import { MainContentFrame } from "@vetta-org/theme-ui/layout/MainContentFrame";
import { SidebarDock } from "@vetta-org/theme-ui/layout/SidebarDock";
import { SidebarPanel } from "@vetta-org/theme-ui/sidebar";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/renderer/styles.css";

// Only page content is a fixture; shell components and all layout styles are production code.
function LayoutFixture() {
	const [chat, setChat] = useState(false);
	const [visible, setVisible] = useState(true);
	return (
		<AppFrame className="app-frame">
			<SidebarDock className="sidebar-dock" visible={visible} width={260}>
				<SidebarPanel width={260} onResize={() => {}} onResizeEnd={() => {}}>
					<nav className="flex shrink-0 flex-col p-2">
						<button type="button" onClick={() => setChat(false)}>
							新会话
						</button>
						<button type="button" onClick={() => setChat(true)}>
							打开已有会话
						</button>
					</nav>
					<section aria-label="会话列表" className="min-h-0 flex-1 overflow-y-auto">
						{Array.from({ length: 60 }, (_, index) => (
							<button key={index} type="button" className="block h-9 w-full" onClick={() => setChat(true)}>
								会话 {index + 1}
							</button>
						))}
					</section>
					<div data-testid="sidebar-bottom" className="h-11 shrink-0 p-2">
						设置
					</div>
				</SidebarPanel>
			</SidebarDock>
			<MainContentFrame
				className="app-main-frame"
				headerOverlay={chat}
				header={
					<div className="flex h-11 items-center gap-2">
						<button type="button" onClick={() => setVisible((value) => !value)}>
							切换侧边栏
						</button>
						<span>{chat ? "已有会话" : "新会话页面"}</span>
					</div>
				}
			>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<section aria-label="消息列表" className="min-h-0 flex-1 overflow-y-auto">
						{chat ? Array.from({ length: 80 }, (_, index) => <p key={index}>消息 {index + 1}</p>) : null}
					</section>
					<textarea aria-label="消息输入框" className="h-24 shrink-0" />
				</div>
			</MainContentFrame>
		</AppFrame>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing layout fixture root");
createRoot(root).render(<LayoutFixture />);
