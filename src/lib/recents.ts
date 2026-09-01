// A list you have to read is no faster than typing the name.
export const MAX_RECENTS = 5;

export type RecentsStorage = {
	read: () => string | null;
	write: (value: string) => void;
};

export type Recents = {
	list: () => string[];
	remember: (id: string) => string[];
};

export const nextRecents = (recents: readonly string[], id: string) =>
	[id, ...recents.filter((recent) => recent !== id)].slice(0, MAX_RECENTS);

// Corrupt storage has to read as no history, not as a failure.
const parse = (raw: string | null): string[] => {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.filter((id): id is string => typeof id === "string")
			.slice(0, MAX_RECENTS);
	} catch {
		return [];
	}
};

export const createRecents = (storage: RecentsStorage): Recents => {
	let recents = parse(storage.read());

	return {
		list: () => recents,
		remember: (id: string) => {
			recents = nextRecents(recents, id);
			storage.write(JSON.stringify(recents));
			return recents;
		},
	};
};
