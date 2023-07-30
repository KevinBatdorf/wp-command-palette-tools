import { useEffect, useState } from '@wordpress/element';
import { calc } from './icons';
import { evaluate } from 'mathjs';
import { NAMESPACE } from '../../constants';
import copy from 'copy-to-clipboard';
import { fireNotice } from '../../lib/wordpress';
import { __ } from '@wordpress/i18n';

export const doBasicMath = (search: string) => {
	const [isLoading, setIsLoading] = useState(true);
	const [output, setOutput] = useState<string>();

	useEffect(() => {
		setIsLoading(true);
		if (!search) return;
		try {
			const result = evaluate(search);
			if (typeof result !== 'number') {
				throw new Error();
			}
			setOutput(String(result));
		} catch (e) {
			setOutput(undefined);
		}
		setIsLoading(false);
	}, [search]);

	if (!output) return null;
	if (output === search) return null;
	return {
		isLoading,
		commands: [
			{
				name: `${NAMESPACE}/math/basic`,
				label: `${search} = ${output}`,
				icon: calc,
				callback: ({ close }: { close: () => void }) => {
					copy(output);
					fireNotice(__('Copied to clipboard!', 'wpcp-tools'));
					close();
				},
			},
		],
	};
};
