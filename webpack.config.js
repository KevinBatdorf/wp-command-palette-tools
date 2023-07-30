const defaultConfig = require('@wordpress/scripts/config/webpack.config');
module.exports = {
	...defaultConfig,
	entry: {
		math: './src/commands/math/math.tsx',
		color: './src/commands/color/color.tsx',
		fun: './src/commands/fun/fun.tsx',
	},
};
