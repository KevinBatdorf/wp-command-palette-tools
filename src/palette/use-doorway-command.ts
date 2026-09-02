import { __ } from "@wordpress/i18n";
import { tool } from "@wordpress/icons";
import { NAMESPACE } from "../constants";
import { useCommand } from "../lib/wordpress";

// Module scope: core re-registers a command whose `keywords` array is new.
const KEYWORDS = [
	__("abilities", "command-palette-tools"),
	__("palette", "command-palette-tools"),
];

export const useDoorwayCommand = (open: () => void) => {
	useCommand({
		name: `${NAMESPACE}/run-ability`,
		label: __("Run an ability…", "command-palette-tools"),
		keywords: KEYWORDS,
		icon: tool,
		// Both are a Modal, so leaving core's open would trap focus inside it.
		callback: ({ close }) => {
			close();
			open();
		},
	});
};
