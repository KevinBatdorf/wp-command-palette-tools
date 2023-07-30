import { registerPlugin } from '@wordpress/plugins';
import '../../editor.css';
import { useCommand } from '../../lib/wordpress';
import { confettiBasic, confettiThreeSeconds } from './confetti';

registerPlugin('wpcp-tools-fun', {
	render: () => {
		if (!useCommand) return null;
		useCommand(confettiBasic);
		useCommand(confettiThreeSeconds);
		return null;
	},
});
