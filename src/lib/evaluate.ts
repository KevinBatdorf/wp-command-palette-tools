// The palette feeds this every keystroke, so non-math input must fail silently.

const CONSTANTS: Record<string, number> = {
	e: Math.E,
	pi: Math.PI,
	tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
	abs: Math.abs,
	ceil: Math.ceil,
	cos: Math.cos,
	floor: Math.floor,
	ln: Math.log,
	log: Math.log10,
	max: Math.max,
	min: Math.min,
	round: Math.round,
	sin: Math.sin,
	sqrt: Math.sqrt,
	tan: Math.tan,
};

type Token =
	| { type: "number"; value: number }
	| { type: "name"; value: string }
	| { type: "punct"; value: string };

const NUMBER = /^\d*\.?\d+(?:[eE][+-]?\d+)?/;
const NAME = /^[a-z]+/i;
const PUNCTUATION = "+-*/%^(),";

const tokenize = (input: string): Token[] => {
	const tokens: Token[] = [];
	let rest = input.trim();

	while (rest.length > 0) {
		if (rest[0] === " " || rest[0] === "\t") {
			rest = rest.slice(1);
			continue;
		}

		const number = NUMBER.exec(rest);
		if (number) {
			tokens.push({ type: "number", value: Number(number[0]) });
			rest = rest.slice(number[0].length);
			continue;
		}

		const name = NAME.exec(rest);
		if (name) {
			tokens.push({ type: "name", value: name[0].toLowerCase() });
			rest = rest.slice(name[0].length);
			continue;
		}

		if (PUNCTUATION.includes(rest[0])) {
			tokens.push({ type: "punct", value: rest[0] });
			rest = rest.slice(1);
			continue;
		}

		throw new SyntaxError(`Unexpected "${rest[0]}"`);
	}

	return tokens;
};

const parse = (tokens: Token[]): number => {
	let position = 0;

	const peek = () => tokens[position];

	const eat = (value: string) => {
		const token = peek();
		if (token?.type === "punct" && token.value === value) {
			position += 1;
			return true;
		}
		return false;
	};

	const expect = (value: string) => {
		if (!eat(value)) throw new SyntaxError(`Expected "${value}"`);
	};

	const parseExpression = (): number => {
		let left = parseTerm();
		for (;;) {
			if (eat("+")) left += parseTerm();
			else if (eat("-")) left -= parseTerm();
			else return left;
		}
	};

	const parseTerm = (): number => {
		let left = parseUnary();
		for (;;) {
			if (eat("*")) left *= parseUnary();
			else if (eat("/")) left /= parseUnary();
			else if (eat("%")) left %= parseUnary();
			else return left;
		}
	};

	// Unary binds looser than "^": -2^2 is -4, and 2^-3 parses.
	const parseUnary = (): number => {
		if (eat("-")) return -parseUnary();
		if (eat("+")) return parseUnary();
		const base = parsePrimary();
		return eat("^") ? base ** parseUnary() : base;
	};

	const parsePrimary = (): number => {
		const token = peek();
		if (!token) throw new SyntaxError("Unexpected end of expression");

		if (token.type === "number") {
			position += 1;
			return token.value;
		}

		if (token.type === "name") {
			position += 1;
			// Own-property checks only: a bare lookup would resolve "constructor".
			if (Object.hasOwn(FUNCTIONS, token.value)) {
				expect("(");
				const args = [parseExpression()];
				while (eat(",")) args.push(parseExpression());
				expect(")");
				return FUNCTIONS[token.value](...args);
			}
			if (Object.hasOwn(CONSTANTS, token.value)) return CONSTANTS[token.value];
			throw new SyntaxError(`Unknown name "${token.value}"`);
		}

		if (eat("(")) {
			const value = parseExpression();
			expect(")");
			return value;
		}

		throw new SyntaxError(`Unexpected "${token.value}"`);
	};

	const result = parseExpression();
	if (position < tokens.length) throw new SyntaxError("Trailing input");
	return result;
};

export const evaluateExpression = (input: string): number | undefined => {
	try {
		const result = parse(tokenize(input));
		return Number.isFinite(result) ? result : undefined;
	} catch {
		return undefined;
	}
};

// Without this, 0.1 + 0.2 reads as 0.30000000000000004.
export const formatResult = (result: number) =>
	String(Number(result.toPrecision(12)));
