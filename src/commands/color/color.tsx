import { registerPlugin } from '@wordpress/plugins';
import '../../editor.css';
import { useCommandLoader } from '../../lib/wordpress';
import { NAMESPACE } from '../../constants';
import { colorConversions } from './convert';

registerPlugin('wpcp-tools-color', {
	render: () => {
		useCommandLoader({
			name: `${NAMESPACE}/color`,
			hook: ({ search }: { search: string }) => colorConversions(search),
		});
		return null;
	},
});
