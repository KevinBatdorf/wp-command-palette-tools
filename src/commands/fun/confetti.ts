import { NAMESPACE } from '../../constants';
import confetti from 'canvas-confetti';
import { confettiIcon } from './icons';

export const confettiBasic = {
	name: `${NAMESPACE}/confetti`,
	label: 'Confetti',
	icon: confettiIcon,
	callback: ({ close }: { close: () => void }) => {
		close();
		fire();
	},
};
export const confettiThreeSeconds = {
	name: `${NAMESPACE}/confetti/5-seconds`,
	label: 'Confetti (3 seconds delay)',
	icon: confettiIcon,
	callback: async ({ close }: { close: () => void }) => {
		close();
		await new Promise((resolve) => setTimeout(resolve, 3_000));
		fire();
	},
};

const fire = () => {
	// Left
	confetti({
		particleCount: 90,
		startVelocity: 85,
		angle: 60,
		spread: 40,
		origin: { x: 0, y: 1 },
	});
	// Right
	confetti({
		particleCount: 90,
		startVelocity: 85,
		angle: 120,
		spread: 40,
		origin: { x: 1, y: 1 },
	});
};
