import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	evaluateExpression,
	formatResult,
} from "../../src/commands/math/evaluate.ts";

const evaluated = (input: string) => {
	const result = evaluateExpression(input);
	return result === undefined ? undefined : formatResult(result);
};

describe("evaluateExpression", () => {
	it("does arithmetic with the usual precedence", () => {
		assert.equal(evaluated("2+2"), "4");
		assert.equal(evaluated("2 + 3 * 4"), "14");
		assert.equal(evaluated("(2 + 3) * 4"), "20");
		assert.equal(evaluated("10 / 4"), "2.5");
		assert.equal(evaluated("10 % 3"), "1");
	});

	it("binds unary minus looser than exponentiation", () => {
		assert.equal(evaluated("-2^2"), "-4");
		assert.equal(evaluated("2^-2"), "0.25");
		assert.equal(evaluated("2^3^2"), "512");
	});

	it("resolves constants and functions", () => {
		assert.equal(evaluated("sqrt(16)"), "4");
		assert.equal(evaluated("max(1, 7, 3)"), "7");
		assert.equal(evaluated("round(pi)"), "3");
	});

	it("hides float noise", () => {
		assert.equal(evaluated("0.1 + 0.2"), "0.3");
	});

	it("returns nothing for ordinary palette input", () => {
		for (const input of [
			"",
			"create a page",
			"draft",
			"2 +",
			"2 2",
			"()",
			"sqrt",
			"sqrt(",
			"1/0",
			"foo(2)",
		]) {
			assert.equal(evaluateExpression(input), undefined, input);
		}
	});

	it("does not resolve inherited object properties", () => {
		assert.equal(evaluateExpression("constructor"), undefined);
		assert.equal(evaluateExpression("constructor(1)"), undefined);
		assert.equal(evaluateExpression("toString(1)"), undefined);
	});
});
