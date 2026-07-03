export interface SelectedFile {
	path: string;
	name: string;
	isDirectory: boolean;
}

export interface AtPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (file: SelectedFile) => void;
	filter: string;
	cwd: string;
	className?: string;
	classNames?: AtPanelClassNames;
}

export interface AtPanelClassNames {
	root?: string;
	content?: string;
	header?: string;
	list?: string;
	item?: string;
}

export interface AtPanelEntryModel {
	path: string;
	name: string;
	isDirectory: boolean;
	relPath?: string;
	index: number;
	active: boolean;
	icon: string;
}

export interface AtPanelLabels {
	header: string;
	headingMeta: string;
	loading: string;
	noResults: string;
	emptyDirectory: string;
	goUp: string;
	enterDirectory: string;
}

export interface AtPanelViewProps {
	open: boolean;
	loading: boolean;
	normalizedFilter: string;
	canGoUp: boolean;
	goUpActive: boolean;
	entries: AtPanelEntryModel[];
	labels: AtPanelLabels;
	panelRef: React.RefObject<HTMLDivElement | null>;
	className?: string;
	classNames?: AtPanelClassNames;
	onGoUp: () => void;
	onHoverIndex: (index: number) => void;
	onEntryClick: (entry: AtPanelEntryModel) => void;
}
