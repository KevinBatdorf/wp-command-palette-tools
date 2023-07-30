import { registerPlugin } from '@wordpress/plugins';
import '../../editor.css';
import { useCommandLoader } from '../../lib/wordpress';
import { NAMESPACE } from '../../constants';
import { doBasicMath } from './basic';

registerPlugin('wpcp-tools-math', {
	render: () => {
		useCommandLoader({
			name: `${NAMESPACE}/math`,
			hook: ({ search }: { search: string }) => doBasicMath(search),
		});
		return null;
	},
});
