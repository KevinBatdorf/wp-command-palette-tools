import confetti from "canvas-confetti";

export const fire = () => {
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
