import { createRecents } from "../lib/recents";

// Two accounts sharing a browser must not read each other's history.
const KEY = `command-palette-tools/recents/${window.userSettings?.uid ?? "0"}`;

// Storage can be disabled outright, and recents are not worth throwing over.
export const recents = createRecents({
	read: () => {
		try {
			return window.localStorage.getItem(KEY);
		} catch {
			return null;
		}
	},
	write: (value) => {
		try {
			window.localStorage.setItem(KEY, value);
		} catch {}
	},
});
