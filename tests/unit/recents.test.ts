import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createRecents,
	MAX_RECENTS,
	nextRecents,
} from "../../src/lib/recents.ts";

const fakeStorage = (initial: string | null = null) => {
	let stored = initial;
	return {
		read: () => stored,
		write: (value: string) => {
			stored = value;
		},
		stored: () => stored,
	};
};

describe("nextRecents", () => {
	it("moves an ability already in the list back to the front", () => {
		assert.deepEqual(nextRecents(["a", "b", "c"], "c"), ["c", "a", "b"]);
	});

	it("stops growing at the cap", () => {
		const full = Array.from({ length: MAX_RECENTS }, (_, i) => `ability-${i}`);
		const next = nextRecents(full, "newest");

		assert.equal(next.length, MAX_RECENTS);
		assert.equal(next[0], "newest");
		assert.ok(!next.includes(`ability-${MAX_RECENTS - 1}`));
	});
});

describe("createRecents", () => {
	it("reads back what a previous page load wrote", () => {
		const storage = fakeStorage();
		createRecents(storage).remember("core/get-site-info");

		assert.deepEqual(createRecents(storage).list(), ["core/get-site-info"]);
	});

	it("treats unreadable storage as no history", () => {
		assert.deepEqual(createRecents(fakeStorage("not json")).list(), []);
		assert.deepEqual(createRecents(fakeStorage('{"a":1}')).list(), []);
		assert.deepEqual(createRecents(fakeStorage("[1, null]")).list(), []);
	});
});
