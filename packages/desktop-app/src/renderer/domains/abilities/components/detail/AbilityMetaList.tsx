import type { AbilityMetaEntry, AbilityMetaKey } from "@shared/lib/api";
import { useTranslation } from "react-i18next";

/** 预置键 → i18n label key。未知键当作自定义条目处理（服务端已白名单校验，这里只是渲染兜底）。 */
const META_LABEL_KEYS = {
	homepage: "meta.homepage",
	repository: "meta.repository",
	docs: "meta.docs",
	license: "meta.license",
} as const satisfies Record<AbilityMetaKey, string>;

/**
 * 详情页元信息表：官网 / 仓库 / 文档 / 开源协议 + 运营自定义条目。
 * 顺序即 raw.detail.meta 的数组顺序（运营在 admin 里排定）。
 */
export function AbilityMetaList({ meta }: { meta: AbilityMetaEntry[] | undefined }): JSX.Element | null {
	const { t } = useTranslation("abilities");
	const entries = (meta ?? []).filter((entry) => entry.value.trim().length > 0);
	if (entries.length === 0) return null;

	return (
		<section>
			<div className="mb-2 text-[13px] font-semibold text-foreground">{t("meta.title")}</div>
			<div className="overflow-hidden rounded-lg border border-border/60">
				<table className="w-full table-fixed text-[12px]">
					<tbody>
						{entries.map((entry, index) => (
							<tr
								// 同一个预置键不会重复出现，但自定义条目可能重名，故带上索引
								key={`${entry.key ?? entry.label ?? ""}-${index}`}
								className="border-b border-border/50 last:border-b-0"
							>
								<th className="w-28 bg-muted/40 px-3 py-2 text-left align-top font-normal text-muted-foreground/70">
									{entry.key && entry.key in META_LABEL_KEYS
										? t(META_LABEL_KEYS[entry.key])
										: (entry.label ?? "")}
								</th>
								<td className="break-words px-3 py-2 align-top text-foreground">
									<MetaValue value={entry.value} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

/** http(s) 开头渲染为可点击链接，其余按纯文本。 */
function MetaValue({ value }: { value: string }): JSX.Element {
	const trimmed = value.trim();
	if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
		return <span>{trimmed}</span>;
	}
	return (
		<a
			href={trimmed}
			target="_blank"
			rel="noreferrer"
			className="text-primary underline-offset-2 hover:underline"
		>
			{trimmed}
		</a>
	);
}
