import { DiagnosticsExportDialogView } from "@vetta-org/theme-ui/overlays";
import { useDiagnosticsExportDialogModel } from "./useDiagnosticsExportDialogModel";

/** 设置 › 通用 › 导出诊断包：说明包里有什么，引导用户带着它去 GitHub Issue 反馈。 */
export function DiagnosticsExportDialog(): JSX.Element {
	const model = useDiagnosticsExportDialogModel();
	return <DiagnosticsExportDialogView {...model} />;
}
