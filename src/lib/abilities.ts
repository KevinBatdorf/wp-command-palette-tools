// Shapes returned by core's ability listing, `GET wp-abilities/v1/abilities`.

export type JsonSchema = {
	type?: string | string[];
	title?: string;
	description?: string;
	properties?: Record<string, JsonSchema>;
	// Core keeps a draft-04 tuple as an array of schemas, one per slot.
	items?: JsonSchema | JsonSchema[];
	enum?: unknown[];
	// A discriminated union of object branches; anything else stays refused.
	oneOf?: JsonSchema[];
	required?: string[];
	default?: unknown;
	additionalProperties?: boolean | JsonSchema;
	[key: string]: unknown;
};

export type AbilityAnnotations = {
	readonly?: boolean;
	destructive?: boolean;
	idempotent?: boolean;
};

export type Ability = {
	name: string;
	label: string;
	description: string;
	category: string;
	input_schema?: JsonSchema;
	output_schema?: JsonSchema;
	meta?: { annotations?: AbilityAnnotations } & Record<string, unknown>;
	_links?: Record<string, { href: string }[] | undefined>;
};

export type Catalog = {
	abilities: Ability[];
	hash: string;
	// Null with an empty list means nothing was registered, not a failed request.
	error: string | null;
};

const EMPTY_CATALOG: Catalog = { abilities: [], hash: "", error: null };

// Ability names contain a slash, so the run URL cannot be built from the name.
const RUN_REL = "wp:action-run";

export const runHref = (ability: Ability) =>
	ability._links?.[RUN_REL]?.[0]?.href ?? null;

const isAbility = (value: unknown): value is Ability =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Ability).name === "string" &&
	typeof (value as Ability).label === "string";

// Only the code separates a missing abilities route from a refused read.
const restErrorCode = (error: unknown) => {
	const code = (error as { code?: unknown } | null | undefined)?.code;
	return typeof code === "string" ? code : "unknown_error";
};

// cyrb53, not a digest: crypto.subtle is async and missing on http:// admin.
// Sorted so reordering is the same catalog; over the text, so an edit invalidates.
export const catalogHash = (abilities: Ability[]) => {
	const text = abilities
		.map(({ name, label, description }) => [name, label, description].join(" "))
		.sort()
		.join("");

	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 =
		Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
		Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 =
		Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
		Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export type CatalogState =
	| "ready"
	| "empty"
	| "unavailable"
	| "forbidden"
	| "failed";

const FORBIDDEN_CODES = new Set([
	"rest_forbidden",
	"rest_cannot_view",
	"rest_cookie_invalid_nonce",
]);

export const catalogState = (catalog: Catalog): CatalogState => {
	if (catalog.error === "rest_no_route") return "unavailable";
	if (catalog.error) {
		return FORBIDDEN_CODES.has(catalog.error) ? "forbidden" : "failed";
	}
	return catalog.abilities.length ? "ready" : "empty";
};

// The listing carries no namespace field of its own.
// WooCommerce names its category after itself, which would read twice.
export const abilitySource = ({ name, category }: Ability) => {
	const [namespace] = name.split("/");
	if (!namespace || namespace === name) return category;
	if (!category || category === namespace) return namespace;

	return `${namespace} · ${category}`;
};

export type CatalogLoader = {
	load: () => Promise<Catalog>;
	clear: () => void;
};

export const createCatalogLoader = (
	fetchAbilities: () => Promise<unknown>,
): CatalogLoader => {
	let pending: Promise<Catalog> | null = null;

	const fetchCatalog = async (): Promise<Catalog> => {
		let payload: unknown;
		try {
			payload = await fetchAbilities();
		} catch (error) {
			return { ...EMPTY_CATALOG, error: restErrorCode(error) };
		}
		if (!Array.isArray(payload)) {
			return { ...EMPTY_CATALOG, error: "unexpected_response" };
		}
		const abilities = payload.filter(isAbility);
		return { abilities, hash: catalogHash(abilities), error: null };
	};

	return {
		load: () =>
			(pending ??= fetchCatalog().then((catalog) => {
				// Caching a failure would make one dead request permanent.
				if (catalog.error) pending = null;
				return catalog;
			})),
		clear: () => {
			pending = null;
		},
	};
};
