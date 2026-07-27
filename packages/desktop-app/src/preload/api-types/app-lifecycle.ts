export interface DesktopAppLifecycleApi {
	reportRendererBootPainted(): void;
	whenReady(): Promise<void>;
}
