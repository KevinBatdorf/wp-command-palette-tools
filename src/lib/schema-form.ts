// An ability's `input_schema` turned into controls to render. No WP imports, so
// `node --test` covers this rather than an assertion on rendered copy.
//
// Core's `wp_prepare_json_schema_for_client` folds a draft-03 per-property
// `required: true` into an array on the parent, and passes alternation through.

import type { JsonSchema } from "./abilities";

// Codes, not sentences: every one of these is rendered translated.
export type UnsupportedReason =
	| "alternatives"
	| "tuple"
	| "freeform"
	| "untyped"
	| "mixed-types";

export type FieldError =
	| { code: "required" }
	| { code: "min-length"; limit: number }
	| { code: "max-length"; limit: number }
	| { code: "pattern" }
	| { code: "not-a-number" }
	| { code: "not-an-integer" }
	| { code: "minimum"; limit: number; exclusive: boolean }
	| { code: "maximum"; limit: number; exclusive: boolean }
	| { code: "min-items"; limit: number }
	| { code: "max-items"; limit: number };

// `value` is kept beside the string so a numeric or boolean enum survives the DOM.
export type Option = { key: string; label: string; value: unknown };

type Control =
	| {
			control: "text";
			inputType: "text" | "email" | "url";
			minLength?: number;
			maxLength?: number;
			pattern?: string;
	  }
	| {
			control: "number";
			integer: boolean;
			minimum?: number;
			maximum?: number;
			exclusiveMinimum?: boolean;
			exclusiveMaximum?: boolean;
	  }
	| { control: "toggle" }
	| { control: "select"; options: Option[] }
	| {
			control: "checkboxes";
			options: Option[];
			minItems?: number;
			maxItems?: number;
	  }
	| { control: "list"; item: Field; minItems?: number; maxItems?: number }
	| { control: "group"; fields: Field[] }
	| { control: "unsupported"; reason: UnsupportedReason };

export type Field = Control & {
	key: string;
	// An empty path means the whole input is this field's value.
	path: string[];
	label: string;
	description?: string;
	required: boolean;
	defaultValue?: unknown;
};

export type Form = {
	fields: Field[];
	// A schema no form can show, as opposed to one field that cannot.
	unsupported: UnsupportedReason | null;
	defaultValue?: unknown;
};

// Stands in for a row index until a row exists to number.
const ITEM_INDEX = "*";

// No property path can produce this, so the root field collides with nothing.
const ROOT_KEY = "$";

const ALTERNATION = ["anyOf", "oneOf", "allOf", "not", "$ref"];

const INPUT_TYPES: Record<string, "email" | "url"> = {
	email: "email",
	uri: "url",
};

const pathKey = (path: readonly string[]) => path.join(".") || ROOT_KEY;

// Property names are not translatable, so this is the only label they can have.
const humanize = (key: string) => {
	const spaced = key
		.replace(/[_-]+/g, " ")
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.trim();

	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const finite = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const count = (value: unknown) => {
	const found = finite(value);
	return found !== undefined && found >= 0 ? Math.floor(found) : undefined;
};

type Resolved =
	| { type: string; nullable: boolean }
	| { reason: UnsupportedReason };

const resolveType = (schema: JsonSchema): Resolved => {
	if (ALTERNATION.some((keyword) => schema[keyword] !== undefined)) {
		return { reason: "alternatives" };
	}

	const declared = Array.isArray(schema.type)
		? schema.type
		: schema.type
			? [schema.type]
			: [];
	// `['string', 'null']` is an optional string, not two kinds of value.
	const types = declared.filter((type) => type !== "null");
	const nullable = types.length !== declared.length;

	if (types.length > 1) return { reason: "mixed-types" };
	if (types.length === 1) return { type: types[0], nullable };
	// An enum says what the values are even when nothing says what type they are.
	if (Array.isArray(schema.enum) && schema.enum.length) {
		return { type: "enum", nullable };
	}

	return { reason: "untyped" };
};

const enumOptions = (schema: JsonSchema): Option[] | null => {
	if (!Array.isArray(schema.enum) || !schema.enum.length) return null;

	return schema.enum.map((value) => ({
		key: JSON.stringify(value) ?? String(value),
		label: String(value),
		value,
	}));
};

type Base = Omit<Field, keyof Control> & { control?: never };

const itemBounds = (schema: JsonSchema) => ({
	minItems: count(schema.minItems),
	maxItems: count(schema.maxItems),
});

const arrayField = (base: Base, schema: JsonSchema): Field => {
	const { items } = schema;
	// A tuple `items` is one control per slot, which is not a repeater of one.
	if (Array.isArray(items)) {
		return { ...base, control: "unsupported", reason: "tuple" };
	}
	if (!items || typeof items !== "object") {
		return { ...base, control: "unsupported", reason: "untyped" };
	}

	const options = enumOptions(items);
	// The only array shape core ships: a set picked from a fixed list.
	if (options) {
		return { ...base, control: "checkboxes", options, ...itemBounds(schema) };
	}

	return {
		...base,
		control: "list",
		// A row that exists holds a value, whatever the array's own rules say.
		item: toField(items, [...base.path, ITEM_INDEX], base.label, true),
		...itemBounds(schema),
	};
};

const objectFields = (schema: JsonSchema, path: readonly string[]): Field[] => {
	const { properties } = schema;
	if (!properties || typeof properties !== "object") return [];

	const required = new Set(
		Array.isArray(schema.required)
			? schema.required.filter(
					(name): name is string => typeof name === "string",
				)
			: [],
	);

	return Object.entries(properties).map(([name, child]) =>
		toField(child, [...path, name], humanize(name), required.has(name)),
	);
};

const objectField = (base: Base, schema: JsonSchema): Field => {
	// Without `properties` there is no key to put a label on.
	if (!schema.properties || typeof schema.properties !== "object") {
		return { ...base, control: "unsupported", reason: "freeform" };
	}

	return { ...base, control: "group", fields: objectFields(schema, base.path) };
};

const toField = (
	schema: JsonSchema,
	path: string[],
	label: string,
	required: boolean,
): Field => {
	const base: Base = {
		key: pathKey(path),
		path,
		label: schema.title ?? label,
		description:
			typeof schema.description === "string" ? schema.description : undefined,
		required,
		defaultValue: schema.default,
	};

	const resolved = resolveType(schema);
	if ("reason" in resolved) {
		return { ...base, control: "unsupported", reason: resolved.reason };
	}

	const options = enumOptions(schema);
	if (options) return { ...base, control: "select", options };

	switch (resolved.type) {
		case "boolean":
			return { ...base, control: "toggle" };
		case "integer":
		case "number":
			return {
				...base,
				control: "number",
				integer: resolved.type === "integer",
				minimum: finite(schema.minimum),
				maximum: finite(schema.maximum),
				// draft-04 spells these as flags on `minimum` / `maximum`.
				exclusiveMinimum: schema.exclusiveMinimum === true,
				exclusiveMaximum: schema.exclusiveMaximum === true,
			};
		case "string":
			return {
				...base,
				control: "text",
				inputType:
					INPUT_TYPES[typeof schema.format === "string" ? schema.format : ""] ??
					"text",
				minLength: count(schema.minLength),
				maxLength: count(schema.maxLength),
				pattern:
					typeof schema.pattern === "string" ? schema.pattern : undefined,
			};
		case "array":
			return arrayField(base, schema);
		case "object":
			return objectField(base, schema);
		default:
			return { ...base, control: "unsupported", reason: "untyped" };
	}
};

export const toForm = (
	schema: JsonSchema | undefined,
	fallbackLabel = "",
): Form => {
	// An ability with no input leaves the schema empty, and core sends `[]`.
	if (!schema || !Object.keys(schema).length) {
		return { fields: [], unsupported: null };
	}

	const resolved = resolveType(schema);
	if ("reason" in resolved) return { fields: [], unsupported: resolved.reason };

	if (resolved.type === "object") {
		if (!schema.properties || typeof schema.properties !== "object") {
			return { fields: [], unsupported: "freeform" };
		}

		return {
			fields: objectFields(schema, []),
			unsupported: null,
			defaultValue: schema.default,
		};
	}

	// The run route takes the whole input as one value, so this is one field.
	return {
		fields: [
			toField(
				schema,
				[],
				schema.title ?? fallbackLabel,
				!("default" in schema) && !resolved.nullable,
			),
		],
		unsupported: null,
		defaultValue: schema.default,
	};
};

export const readAt = (input: unknown, path: readonly string[]): unknown => {
	let current = input;
	for (const segment of path) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
};

export const writeAt = (
	input: unknown,
	path: readonly string[],
	value: unknown,
): unknown => {
	if (!path.length) return value;

	const [segment, ...rest] = path;
	// An index segment means the level holding it is a list, not an object.
	if (/^\d+$/.test(segment)) {
		const list = Array.isArray(input) ? [...input] : [];
		// Clamped because a hole left in the array would be sent as null.
		const at = Math.min(Number(segment), list.length);
		list[at] = writeAt(list[at], rest, value);
		return list;
	}

	const object =
		input !== null && typeof input === "object" && !Array.isArray(input)
			? { ...(input as Record<string, unknown>) }
			: {};
	object[segment] = writeAt(object[segment], rest, value);

	return object;
};

// Leftmost only, so an inner list keeps its own once the outer row is numbered.
const fillIndex = (field: Field, index: string): Field => {
	const at = field.path.indexOf(ITEM_INDEX);
	if (at === -1) return field;

	const path = [...field.path];
	path[at] = index;
	const next = { ...field, path, key: pathKey(path) };

	if (next.control === "group") {
		return {
			...next,
			fields: next.fields.map((child) => fillIndex(child, index)),
		};
	}
	if (next.control === "list") {
		return { ...next, item: fillIndex(next.item, index) };
	}

	return next;
};

export const itemField = (item: Field, index: number) =>
	fillIndex(item, String(index));

export const emptyValue = (field: Field): unknown => {
	switch (field.control) {
		case "group":
			return {};
		case "list":
		case "checkboxes":
			return [];
		case "toggle":
			return false;
		default:
			return "";
	}
};

const seed = (field: Field, input: unknown): unknown => {
	if (field.control === "group") {
		let next = input;
		for (const child of field.fields) next = seed(child, next);
		return next;
	}
	if (field.defaultValue === undefined) return input;
	if (readAt(input, field.path) !== undefined) return input;

	return writeAt(input, field.path, field.defaultValue);
};

export const initialInput = (form: Form): unknown => {
	let input = form.defaultValue;
	for (const field of form.fields) input = seed(field, input);

	return input;
};

// `false` and `0` are answers; only an absent one is unfilled.
const isBlank = (value: unknown) =>
	value === undefined || value === null || value === "";

const matchesPattern = (pattern: string, value: string) => {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		// An unusable pattern is the schema author's problem, not the user's.
		return true;
	}
};

const textError = (
	field: Field & { control: "text" },
	value: unknown,
): FieldError | null => {
	const text = String(value);
	if (field.minLength !== undefined && text.length < field.minLength) {
		return { code: "min-length", limit: field.minLength };
	}
	if (field.maxLength !== undefined && text.length > field.maxLength) {
		return { code: "max-length", limit: field.maxLength };
	}
	if (field.pattern && !matchesPattern(field.pattern, text)) {
		return { code: "pattern" };
	}

	return null;
};

const numberError = (
	field: Field & { control: "number" },
	value: unknown,
): FieldError | null => {
	const found = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(found)) return { code: "not-a-number" };
	if (field.integer && !Number.isInteger(found)) {
		return { code: "not-an-integer" };
	}

	const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = field;
	if (
		minimum !== undefined &&
		(exclusiveMinimum ? found <= minimum : found < minimum)
	) {
		return { code: "minimum", limit: minimum, exclusive: !!exclusiveMinimum };
	}
	if (
		maximum !== undefined &&
		(exclusiveMaximum ? found >= maximum : found > maximum)
	) {
		return { code: "maximum", limit: maximum, exclusive: !!exclusiveMaximum };
	}

	return null;
};

const countError = (
	field: Field & { control: "list" | "checkboxes" },
	length: number,
): FieldError | null => {
	if (field.required && !length) return { code: "required" };
	// An untouched optional list is empty, not short.
	if (length && field.minItems !== undefined && length < field.minItems) {
		return { code: "min-items", limit: field.minItems };
	}
	if (field.maxItems !== undefined && length > field.maxItems) {
		return { code: "max-items", limit: field.maxItems };
	}

	return null;
};

const collect = (
	field: Field,
	input: unknown,
	errors: Record<string, FieldError>,
) => {
	if (field.control === "group") {
		for (const child of field.fields) collect(child, input, errors);
		return;
	}
	if (field.control === "unsupported") return;

	const value = readAt(input, field.path);

	if (field.control === "list" || field.control === "checkboxes") {
		const list = Array.isArray(value) ? value : [];
		const error = countError(field, list.length);
		if (error) {
			errors[field.key] = error;
			return;
		}
		if (field.control === "list") {
			for (const [index] of list.entries()) {
				collect(itemField(field.item, index), input, errors);
			}
		}
		return;
	}

	if (isBlank(value)) {
		if (field.required) errors[field.key] = { code: "required" };
		return;
	}

	const error =
		field.control === "text"
			? textError(field, value)
			: field.control === "number"
				? numberError(field, value)
				: null;
	if (error) errors[field.key] = error;
};

export const fieldErrors = (form: Form, input: unknown) => {
	const errors: Record<string, FieldError> = {};
	for (const field of form.fields) collect(field, input, errors);

	return errors;
};
