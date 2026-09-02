import { dispatch } from "@wordpress/data";
import { store as noticesStore } from "@wordpress/notices";
import type { ToolCommand } from "./tool-commands";

const wpCommands = window.wp?.commands;
export const useCommand = (command: WpCommand) =>
	wpCommands?.useCommand?.(command);
export const useCommandLoader = (loader: CommandLoader) =>
	wpCommands?.useCommandLoader?.(loader);

export const toEditorCommand = (
	tool: ToolCommand,
	icon: JSX.Element,
): WpCommand => ({
	name: tool.id,
	label: tool.label,
	keywords: tool.keywords,
	icon,
	callback: ({ close }) => {
		close();
		void tool.run(fireNotice);
	},
});

// Importing the store is what registers it: outside the editor nothing else has.
export const fireNotice = (message: string, context?: string) => {
	dispatch(noticesStore).createNotice("info", message, {
		context,
		isDismissible: true,
		type: "snackbar",
	});
};

declare global {
	interface Window {
		wp: {
			commands?: {
				useCommand: (command: WpCommand) => void;
				useCommandLoader: (loader: CommandLoader) => void;
			};
		};
		// Localized by the plugin: the front end prints no `userSettings`.
		wpcpTools?: { uid?: string };
	}
}

type WpCommand = {
	name: string;
	label: string;
	keywords?: string[];
	icon: JSX.Element;
	callback: ({ close }: { close: () => void }) => void;
};

type CommandLoader = {
	name: string;
	hook: (args: { search: string }) => null | {
		commands: WpCommand[];
		isLoading: boolean;
	};
};
