import { i18n } from "@shared/i18n";
import { languageAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback } from "react";
import type { AppLanguage } from "@/shared/i18n/config";

export function useLanguage(): {
	language: AppLanguage;
	setLanguage: (lang: AppLanguage) => Promise<void>;
} {
	const [language, setLanguageAtom] = useAtom(languageAtom);

	const setLanguage = useCallback(
		async (lang: AppLanguage): Promise<void> => {
			if (lang === language) return;
			// 乐观即时切：本窗口先变，再写主进程（持久化 + 重建菜单 + 广播回环幂等）。
			setLanguageAtom(lang);
			await i18n.changeLanguage(lang);
			document.documentElement.lang = lang;
			await window.vetta.i18n.setLanguage(lang);
		},
		[language, setLanguageAtom],
	);

	return { language, setLanguage };
}
