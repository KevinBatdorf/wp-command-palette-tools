import tailwindcss from "@tailwindcss/postcss";
import config from "@wordpress/scripts/config/webpack.config.js";
import postcssPrefixSelector from "postcss-prefix-selector";

// Override PostCSS configuration
const loader = config.module.rules
	.find(({ test }) => test?.toString()?.includes("css"))
	.use.find(({ loader }) => loader?.includes("postcss-loader"));

const prefix = ".wpcp-tools";
loader.options.postcssOptions.plugins = [
	tailwindcss(),
	postcssPrefixSelector({
		prefix,
		transform(prefix, selector, prefixedSelector, filePath, rule) {
			if (/node_modules/.test(filePath)) return selector;
			if (/^(html|body|:root|:host)/.test(selector)) {
				return selector.replace(/^([^\s]*)/, `$1 ${prefix}`);
			}
			const a = rule.prev();
			if (a?.type === "comment" && a.text.trim() === "no-prefix") {
				return selector;
			}
			return prefixedSelector;
		},
	}),
];

// onnxruntime's default browser build wants a 25MB WebGPU wasm we do not ship.
config.resolve.alias = {
	...config.resolve.alias,
	"onnxruntime-web$": "onnxruntime-web/wasm",
};

config.entry = {
	math: "./src/commands/math/math.tsx",
	color: "./src/commands/color/color.tsx",
	fun: "./src/commands/fun/fun.tsx",
	palette: "./src/palette/palette.tsx",
};

export default config;
