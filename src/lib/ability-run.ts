// A filled form turned into the request core's run controller accepts.
//
// The method comes from the ability's annotations and any other answers 405.
// GET and DELETE carry `input` in the query string, POST in the JSON body.

import { addQueryArgs } from "@wordpress/url";
import { type Ability, runHref } from "./abilities.ts";
import {
	type Field,
	type Form,
	isBlank,
	itemField,
	readAt,
	writeAt,
} from "./schema-form.ts";

export type RunMethod = "GET" | "DELETE" | "POST";

export type RunRequest = {
	url: string;
	method: RunMethod;
	data?: { input: unknown };
};

export type ConfirmKind = "none" | "changes" | "destructive";

export type RunFailure = { code: string; message: string | null };

const annotations = (ability: Ability) => ability.meta?.annotations ?? {};

export const runMethod = (ability: Ability): RunMethod => {
	const { readonly, destructive, idempotent } = annotations(ability);
	// Readonly first, as core does, so a contradictory pair still avoids a 405.
	if (readonly) return "GET";
	if (destructive && idempotent) return "DELETE";

	return "POST";
};

// Nothing makes the gate follow the method, so contradictory annotations ask.
export const confirmKind = (ability: Ability): ConfirmKind => {
	const { readonly, destructive } = annotations(ability);
	if (destructive) return "destructive";

	return readonly ? "none" : "changes";
};

// A required control we refuse to render makes a valid input impossible.
const unfillable = (field: Field): boolean => {
	if (field.control === "unsupported") return field.required;
	if (field.control === "group") return field.fields.some(unfillable);

	return false;
};

export const hasUnfillable = (form: Form) => form.fields.some(unfillable);

const collect = (field: Field, input: unknown, sent: unknown): unknown => {
	if (field.control === "group") {
		let next = sent;
		for (const child of field.fields) next = collect(child, input, next);
		return next;
	}
	if (field.control === "unsupported") return sent;

	const value = readAt(input, field.path);

	if (field.control === "list") {
		let next = sent;
		const rows = Array.isArray(value) ? value : [];
		for (const [index] of rows.entries()) {
			next = collect(itemField(field.item, index), input, next);
		}
		return next;
	}
	if (field.control === "checkboxes") {
		const picked = Array.isArray(value) ? value : [];
		return picked.length ? writeAt(sent, field.path, picked) : sent;
	}
	if (isBlank(value)) return sent;
	if (field.control === "number") {
		const number = typeof value === "number" ? value : Number(value);
		// A number the form rejected never reaches here.
		return Number.isFinite(number) ? writeAt(sent, field.path, number) : sent;
	}

	return writeAt(sent, field.path, value);
};

// Core's schema sets `additionalProperties: false`, so a key the form never
// showed is a 400.
export const coerceInput = (form: Form, input: unknown): unknown => {
	let sent: unknown;
	for (const field of form.fields) sent = collect(field, input, sent);

	return sent;
};

// A query string cannot spell an empty object, so addQueryArgs leaves a bare ?.
const withInput = (href: string, input: unknown) =>
	input === undefined ? href : addQueryArgs(href, { input }).replace(/\?$/, "");

export const runRequest = (
	ability: Ability,
	input: unknown,
): RunRequest | null => {
	const href = runHref(ability);
	if (!href) return null;

	const method = runMethod(ability);
	if (method === "POST") return { url: href, method, data: { input } };

	return { url: withInput(href, input), method };
};

// A thrown TypeError carries a message too, and it is not written for a reader.
export const runFailure = (error: unknown): RunFailure => {
	const body = error as { code?: unknown; message?: unknown } | null;
	if (typeof body?.code !== "string") {
		return { code: "unknown_error", message: null };
	}

	return {
		code: body.code,
		message: typeof body.message === "string" ? body.message : null,
	};
};
