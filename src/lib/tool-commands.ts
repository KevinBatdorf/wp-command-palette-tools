import { __, sprintf } from "@wordpress/i18n";
import copy from "copy-to-clipboard";
import { NAMESPACE } from "../constants";
import { convertColor, evaluateMath } from "./tools";

export type Announce = (message: string) => void;

export type ToolCommand = {
	id: string;
	label: string;
	keywords?: string[];
	// The editor and the palette render notices from different lists.
	run: (announce: Announce) => void | Promise<void>;
};

const copyCommand = (
	id: string,
	label: string,
	value: string,
): ToolCommand => ({
	id,
	label,
	run: (announce) => {
		copy(value);
		announce(__("Copied to clipboard!", "command-palette-tools"));
	},
});

export const mathTools = (search: string): ToolCommand[] => {
	const math = evaluateMath(search);
	if (!math) return [];

	return [
		copyCommand(
			`${NAMESPACE}/math/basic`,
			`${math.expression} = ${math.value}`,
			math.value,
		),
	];
};

export const colorTools = (search: string): ToolCommand[] =>
	convertColor(search).map(({ format, value }) =>
		copyCommand(
			`${NAMESPACE}/color/convert/${format}`,
			sprintf(
				/* translators: 1: what was typed, 2: a colour format such as hex, 3: the converted colour. */
				__("%1$s to %2$s: %3$s", "command-palette-tools"),
				search.trim(),
				format,
				value,
			),
			value,
		),
	);

// canvas-confetti is larger than everything else here put together.
const fireConfetti = async () => {
	const { fire } = await import(
		/* webpackChunkName: "confetti" */ "../commands/fun/confetti"
	);
	fire();
};

export const funTools = (): ToolCommand[] => [
	{
		id: `${NAMESPACE}/confetti`,
		label: __("Confetti", "command-palette-tools"),
		keywords: [
			__("celebrate", "command-palette-tools"),
			__("party", "command-palette-tools"),
		],
		run: fireConfetti,
	},
	{
		id: `${NAMESPACE}/confetti/5-seconds`,
		label: __("Confetti (3 seconds delay)", "command-palette-tools"),
		keywords: [
			__("celebrate", "command-palette-tools"),
			__("party", "command-palette-tools"),
		],
		run: async () => {
			await new Promise((resolve) => setTimeout(resolve, 3_000));
			await fireConfetti();
		},
	},
];
