import { useThemeModule } from "./context";

export function useThemeComponent<TComponent>(id: string, fallback: TComponent): TComponent {
	const theme = useThemeModule();
	return (theme.components?.[id] as TComponent | undefined) ?? fallback;
}
