import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertColor, evaluateMath } from "../../src/lib/tools.ts";

describe("evaluateMath", () => {
	it("answers an expression", () => {
		assert.deepEqual(evaluateMath("2+2"), { expression: "2+2", value: "4" });
		assert.deepEqual(evaluateMath(" 10 / 4 "), {
			expression: "10 / 4",
			value: "2.5",
		});
	});

	it("says nothing about input that is not an expression", () => {
		assert.equal(evaluateMath("update price"), null);
		assert.equal(evaluateMath(""), null);
	});

	it("does not echo a number back as its own result", () => {
		assert.equal(evaluateMath("4"), null);
	});
});

describe("convertColor", () => {
	it("converts a named colour into every other format", () => {
		assert.deepEqual(convertColor("red"), [
			{ format: "hex", value: "#ff0000" },
			{ format: "rgb", value: "rgb(255, 0, 0)" },
			{ format: "hsl", value: "hsl(0, 100%, 50%)" },
		]);
	});

	it("leaves out the format that was typed", () => {
		assert.ok(!convertColor("#ff0000").some(({ format }) => format === "hex"));
	});

	it("says nothing about input that is not a colour", () => {
		assert.deepEqual(convertColor("2+2"), []);
		assert.deepEqual(convertColor(""), []);
	});
});
