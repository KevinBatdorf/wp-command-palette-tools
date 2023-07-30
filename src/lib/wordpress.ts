import { dispatch } from '@wordpress/data';

const wpCommands = window.wp?.commands;
export const useCommand = (command: WpCommand) =>
	wpCommands?.useCommand?.(command);
export const useCommandLoader = (loader: CommandLoader) =>
	wpCommands?.useCommandLoader?.(loader);

export const fireNotice = (message: string) => {
	const { createNotice } = dispatch('core/notices');
	createNotice('info', message, {
		isDismissible: true,
		type: 'snackbar',
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
	}
}

type WpCommand = {
	name: string;
	label: string;
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
