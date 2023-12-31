const tailwind = require('./tailwind.config');

module.exports = ({ mode }) => ({
	ident: 'postcss',
	sourceMap: mode !== 'production',
	plugins: [
		require('postcss-import'),
		require('tailwindcss/nesting'),
		require('tailwindcss')(tailwind),
		(css) =>
			css.walkRules((rule) => {
				// Removes top level TW styles like *::before {}
				rule.selector.startsWith('*') && rule.remove();
			}),
		// See: https://github.com/WordPress/gutenberg/blob/trunk/packages/postcss-plugins-preset/lib/index.js
		require('autoprefixer')({ grid: true }),
		mode === 'production' &&
			// See: https://github.com/WordPress/gutenberg/blob/trunk/packages/scripts/config/webpack.config.js#L88
			require('cssnano')({
				preset: [
					'default',
					{
						discardComments: {
							removeAll: true,
						},
					},
				],
			}),
	],
});
