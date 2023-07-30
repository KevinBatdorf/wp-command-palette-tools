import { useEffect, useState } from '@wordpress/element';
import { NAMESPACE } from '../../constants';
import copy from 'copy-to-clipboard';
import { fireNotice } from '../../lib/wordpress';
import { __, sprintf } from '@wordpress/i18n';
import { colorIcon } from './icons';
import { colord, extend } from 'colord';
import namesPlugin from 'colord/plugins/names';

extend([namesPlugin]);

export const colorConversions = (search: string) => {
	const [isLoading, setIsLoading] = useState(true);
	const [color, setColor] = useState<any>();

	useEffect(() => {
		setIsLoading(true);
		if (!search) return;
		try {
			setColor(colord(search));
		} catch (e) {
			setColor(undefined);
		}
		setIsLoading(false);
	}, [search]);

	if (!color?.parsed) return null;
	const colors = {
		hex: {
			label: 'hex',
			value: color.toHex(),
		},
		rgb: {
			label: 'rgb',
			value: color.toRgbString(),
		},
		hsl: {
			label: 'hsl',
			value: color.toHslString(),
		},
		name: {
			label: 'name',
			value: color.toName({ closest: true }),
		},
	};

	return {
		isLoading,
		commands: Object.entries(colors)
			// Don't include the search if it matches the value
			.filter(([_, value]) => value.value !== search)
			.map(([key, value]) => ({
				name: `${NAMESPACE}/color/convert/${key}`,
				// need to include the search in the label so it shows up in the search results
				label: sprintf(
					__('%s to %s: %s', 'wpcp-tools'),
					search,
					value.label,
					value.value,
				),
				icon: colorIcon,
				callback: ({ close }: { close: () => void }) => {
					copy(value.value);
					fireNotice(__('Copied to clipboard!', 'wpcp-tools'));
					close();
				},
			})),
	};
};
