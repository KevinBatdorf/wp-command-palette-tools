import { useDispatch } from "@wordpress/data";
import { useEffect } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import {
	store as keyboardShortcutsStore,
	__unstableUseShortcutEventMatch as useShortcutEventMatch,
} from "@wordpress/keyboard-shortcuts";
import { isKeyboardEvent } from "@wordpress/keycodes";

export const OPEN_SHORTCUT = "command-palette-tools/open";

const ADMIN_BAR_TRIGGER = "#wp-admin-bar-wpcp-tools-palette a";

export const useOpenPalette = (toggle: () => void) => {
	const { registerShortcut } = useDispatch(keyboardShortcutsStore);
	const isMatch = useShortcutEventMatch();

	// Registering only puts it in the shortcut help modal; it binds nothing.
	useEffect(() => {
		registerShortcut({
			name: OPEN_SHORTCUT,
			category: "global",
			description: __("Open the ability palette.", "command-palette-tools"),
			keyCombination: { modifier: "primary", character: "j" },
		});
	}, [registerShortcut]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;

			// Core's palette owns Cmd+K wherever it is mounted.
			const claimsK =
				!window.wp?.commands && isKeyboardEvent.primary(event, "k");
			if (!claimsK && !isMatch(OPEN_SHORTCUT, event)) return;

			event.preventDefault();
			toggle();
		};

		// useShortcut only fires inside a ShortcutProvider; admin screens have none.
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isMatch, toggle]);

	useEffect(() => {
		const trigger = document.querySelector(ADMIN_BAR_TRIGGER);
		if (!trigger) return;

		const onClick = (event: Event) => {
			event.preventDefault();
			toggle();
		};

		trigger.addEventListener("click", onClick);
		return () => trigger.removeEventListener("click", onClick);
	}, [toggle]);
};
