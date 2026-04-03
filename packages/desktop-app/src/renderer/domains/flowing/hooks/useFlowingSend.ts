import { type FlowingTransferVO, sendFlowing } from "@shared/lib/api";
import { pathBasename } from "@shared/lib/utils";
import { authTokenAtom, authUserAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

interface SendFlowingParams {
	projectDir: string;
	projectName: string;
	flowingId?: number;
	receiverIds: number[];
	parentTransferID?: number;
	message: string;
	filePaths: string[];
}

function toFlowingFileLabel(filePath: string, projectDir: string): string {
	const normalizedFile = filePath.replace(/\\/g, "/");
	const normalizedProject = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
	if (normalizedProject && normalizedFile.startsWith(`${normalizedProject}/`)) {
		return normalizedFile.slice(normalizedProject.length + 1);
	}
	return pathBasename(filePath);
}

export function useFlowingSend(): {
	sending: boolean;
	error: string | null;
	send: (params: SendFlowingParams) => Promise<FlowingTransferVO[] | null>;
} {
	const token = useAtomValue(authTokenAtom);
	const user = useAtomValue(authUserAtom);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const send = useCallback(
		async (params: SendFlowingParams): Promise<FlowingTransferVO[] | null> => {
			if (!token) {
				setError("未登录");
				return null;
			}
			setSending(true);
			setError(null);

			try {
				// 1. 打包文件
				const zipBuffer = await window.vetta.flowing.packFiles(
					params.projectDir,
					params.filePaths,
					params.message,
					user?.username,
				);

				// 2. 上传
				const blob = new Blob([zipBuffer], { type: "application/zip" });
				const result = await sendFlowing(
					token,
					{
						project_name: params.projectName,
						flowing_id: params.flowingId,
						receiver_ids: params.receiverIds,
						parent_transfer_id: params.parentTransferID,
						message: params.message,
						file_list: params.filePaths.map((p) => toFlowingFileLabel(p, params.projectDir)),
					},
					blob,
				);

				return result;
			} catch (err) {
				const msg = err instanceof Error ? err.message : "发送失败";
				setError(msg);
				return null;
			} finally {
				setSending(false);
			}
		},
		[token, user],
	);

	return { sending, error, send };
}
