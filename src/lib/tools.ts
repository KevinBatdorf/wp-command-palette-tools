// No WordPress imports: `node --test` loads this file directly.

import { colord, extend } from "colord";
import namesPlugin from "colord/plugins/names";
// Extension required: `node --test` resolves this import itself.
import { evaluateExpression, formatResult } from "./evaluate.ts";

extend([namesPlugin]);

export type MathMatch = { expression: string; value: string };

export const evaluateMath = (search: string): MathMatch | null => {
	const expression = search.trim();
	if (!expression) return null;

	const result = evaluateExpression(expression);
	if (result === undefined) return null;

	// Typing `4` evaluates to 4; echoing it back is not a result.
	const value = formatResult(result);
	return value === expression ? null : { expression, value };
};

export type ColorFormat = "hex" | "rgb" | "hsl" | "name";
export type ColorMatch = { format: ColorFormat; value: string };

export const convertColor = (search: string): ColorMatch[] => {
	const input = search.trim();
	if (!input) return [];

	const color = colord(input);
	if (!color.isValid()) return [];

	return [
		{ format: "hex" as const, value: color.toHex() },
		{ format: "rgb" as const, value: color.toRgbString() },
		{ format: "hsl" as const, value: color.toHslString() },
		{ format: "name" as const, value: color.toName({ closest: true }) ?? "" },
	].filter(({ value }) => value && value !== input);
};
