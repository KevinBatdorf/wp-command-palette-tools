import {
	Button,
	CheckboxControl,
	Notice,
	SelectControl,
	TextControl,
	ToggleControl,
} from "@wordpress/components";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "@wordpress/element";
import { __, _n, isRTL, sprintf } from "@wordpress/i18n";
import { chevronLeft, chevronRight, closeSmall } from "@wordpress/icons";
import type { Ability } from "../lib/abilities";
import {
	emptyValue,
	type Field,
	type FieldError,
	fieldErrors,
	initialInput,
	itemField,
	type Option,
	readAt,
	toForm,
	type UnsupportedReason,
	writeAt,
} from "../lib/schema-form";

type Setter = (path: string[], value: unknown) => void;

const reasonText = (reason: UnsupportedReason) => {
	switch (reason) {
		case "alternatives":
			return __(
				"This input accepts alternatives that cannot be shown as a form.",
				"command-palette-tools",
			);
		case "tuple":
			return __(
				"This input is an ordered list of different values, which cannot be shown as a form.",
				"command-palette-tools",
			);
		case "freeform":
			return __(
				"This input accepts values that cannot be named in advance.",
				"command-palette-tools",
			);
		case "mixed-types":
			return __(
				"This input accepts more than one kind of value.",
				"command-palette-tools",
			);
		default:
			return __(
				"This input does not say what kind of value it takes.",
				"command-palette-tools",
			);
	}
};

const errorText = (error: FieldError) => {
	switch (error.code) {
		case "required":
			return __("This field is required.", "command-palette-tools");
		case "min-length":
			return sprintf(
				/* translators: %d: the fewest characters the value may have. */
				_n(
					"Use at least %d character.",
					"Use at least %d characters.",
					error.limit,
					"command-palette-tools",
				),
				error.limit,
			);
		case "max-length":
			return sprintf(
				/* translators: %d: the most characters the value may have. */
				_n(
					"Use no more than %d character.",
					"Use no more than %d characters.",
					error.limit,
					"command-palette-tools",
				),
				error.limit,
			);
		case "pattern":
			return __(
				"This value is not in the expected format.",
				"command-palette-tools",
			);
		case "not-a-number":
			return __("Enter a number.", "command-palette-tools");
		case "not-an-integer":
			return __("Enter a whole number.", "command-palette-tools");
		case "minimum":
			return error.exclusive
				? sprintf(
						/* translators: %s: a number the value has to exceed. */
						__("Enter a number greater than %s.", "command-palette-tools"),
						String(error.limit),
					)
				: sprintf(
						/* translators: %s: the lowest number allowed. */
						__("Enter %s or more.", "command-palette-tools"),
						String(error.limit),
					);
		case "maximum":
			return error.exclusive
				? sprintf(
						/* translators: %s: a number the value has to stay below. */
						__("Enter a number less than %s.", "command-palette-tools"),
						String(error.limit),
					)
				: sprintf(
						/* translators: %s: the highest number allowed. */
						__("Enter %s or less.", "command-palette-tools"),
						String(error.limit),
					);
		case "min-items":
			return sprintf(
				/* translators: %d: the fewest values that may be given. */
				_n(
					"Provide at least %d value.",
					"Provide at least %d values.",
					error.limit,
					"command-palette-tools",
				),
				error.limit,
			);
		default:
			return sprintf(
				/* translators: %d: the most values that may be given. */
				_n(
					"Provide no more than %d value.",
					"Provide no more than %d values.",
					error.limit,
					"command-palette-tools",
				),
				error.limit,
			);
	}
};

const labelText = (field: Field, override?: string) => {
	const label = override ?? field.label;
	if (!field.required) return label;

	return sprintf(
		/* translators: %s: the name of a form field that has to be filled in. */
		__("%s (required)", "command-palette-tools"),
		label,
	);
};

const asText = (value: unknown) =>
	value === undefined || value === null ? "" : String(value);

const optionValue = (options: Option[], key: string) =>
	options.find((option) => option.key === key)?.value;

const optionKey = (options: Option[], value: unknown) =>
	options.find((option) => option.value === value)?.key ?? "";

const FieldRow = ({
	field,
	input,
	errors,
	set,
	label,
}: {
	field: Field;
	input: unknown;
	errors: Record<string, FieldError>;
	set: Setter;
	label?: string;
}) => {
	const value = readAt(input, field.path);
	const error = errors[field.key];
	const help = error ? errorText(error) : field.description;

	switch (field.control) {
		case "text":
			return (
				<TextControl
					__nextHasNoMarginBottom
					label={labelText(field, label)}
					type={field.inputType}
					value={asText(value)}
					minLength={field.minLength}
					maxLength={field.maxLength}
					help={help}
					onChange={(next) => set(field.path, next)}
				/>
			);
		case "number":
			return (
				<TextControl
					__nextHasNoMarginBottom
					label={labelText(field, label)}
					type="number"
					// Kept as typed: parsing per keystroke eats a half-written "1.5".
					value={asText(value)}
					min={field.minimum}
					max={field.maximum}
					step={field.integer ? 1 : "any"}
					help={help}
					onChange={(next) => set(field.path, next)}
				/>
			);
		case "toggle":
			return (
				<ToggleControl
					__nextHasNoMarginBottom
					label={labelText(field, label)}
					checked={value === true}
					help={help}
					onChange={(next) => set(field.path, next)}
				/>
			);
		case "select":
			return (
				<SelectControl
					__nextHasNoMarginBottom
					label={labelText(field, label)}
					value={optionKey(field.options, value)}
					options={[
						...(field.required
							? []
							: [
									{
										label: __("Not set", "command-palette-tools"),
										value: "",
									},
								]),
						...field.options.map((option) => ({
							label: option.label,
							value: option.key,
						})),
					]}
					help={help}
					onChange={(key) => set(field.path, optionValue(field.options, key))}
				/>
			);
		case "checkboxes": {
			const picked = Array.isArray(value) ? value : [];
			const isPicked = (option: Option) =>
				picked.some((entry) => entry === option.value);

			return (
				<fieldset className="wpcp-tools-palette__fieldset">
					<legend>{labelText(field, label)}</legend>
					{field.options.map((option) => (
						<CheckboxControl
							__nextHasNoMarginBottom
							key={option.key}
							label={option.label}
							checked={isPicked(option)}
							onChange={(checked) =>
								// Rebuilt from the schema's order, so ticks do not reorder it.
								set(
									field.path,
									field.options
										.filter((candidate) =>
											candidate.key === option.key
												? checked
												: isPicked(candidate),
										)
										.map((candidate) => candidate.value),
								)
							}
						/>
					))}
					{help && <p className="wpcp-tools-palette__help">{help}</p>}
				</fieldset>
			);
		}
		case "list": {
			const rows = Array.isArray(value) ? value : [];
			const full =
				field.maxItems !== undefined && rows.length >= field.maxItems;

			return (
				<fieldset className="wpcp-tools-palette__fieldset">
					<legend>{labelText(field, label)}</legend>
					{rows.map((_row, index) => {
						const row = itemField(field.item, index);

						return (
							<div className="wpcp-tools-palette__row" key={row.key}>
								<FieldRow
									field={row}
									input={input}
									errors={errors}
									set={set}
									label={sprintf(
										/* translators: 1: the name of a list of values, 2: which one this is. */
										__("%1$s %2$d", "command-palette-tools"),
										field.label,
										index + 1,
									)}
								/>
								<Button
									icon={closeSmall}
									label={__("Remove", "command-palette-tools")}
									onClick={() =>
										set(
											field.path,
											rows.filter((_row, at) => at !== index),
										)
									}
								/>
							</div>
						);
					})}
					{help && <p className="wpcp-tools-palette__help">{help}</p>}
					<Button
						variant="secondary"
						disabled={full}
						onClick={() => set(field.path, [...rows, emptyValue(field.item)])}
					>
						{__("Add", "command-palette-tools")}
					</Button>
				</fieldset>
			);
		}
		case "group":
			return (
				<fieldset className="wpcp-tools-palette__fieldset">
					<legend>{labelText(field, label)}</legend>
					{field.description && (
						<p className="wpcp-tools-palette__help">{field.description}</p>
					)}
					{field.fields.map((child) => (
						<FieldRow
							key={child.key}
							field={child}
							input={input}
							errors={errors}
							set={set}
						/>
					))}
				</fieldset>
			);
		default:
			return (
				<TextControl
					__nextHasNoMarginBottom
					disabled
					label={labelText(field, label)}
					value=""
					help={reasonText(field.reason)}
					onChange={() => undefined}
				/>
			);
	}
};

export const AbilityForm = ({
	ability,
	onBack,
}: {
	ability: Ability;
	onBack: () => void;
}) => {
	const form = useMemo(
		() => toForm(ability.input_schema, ability.label),
		[ability],
	);
	const [input, setInput] = useState<unknown>(() => initialInput(form));
	const errors = fieldErrors(form, input);
	const container = useRef<HTMLDivElement>(null);

	useEffect(() => {
		container.current?.querySelector<HTMLElement>("input, select")?.focus();
	}, []);

	const set = useCallback<Setter>(
		(path, value) =>
			setInput((current: unknown) => writeAt(current, path, value)),
		[],
	);

	return (
		<div className="wpcp-tools-palette__form" ref={container}>
			<div className="wpcp-tools-palette__form-header">
				<Button
					icon={isRTL() ? chevronRight : chevronLeft}
					label={__("Back to results", "command-palette-tools")}
					onClick={onBack}
				/>
				<h2>{ability.label}</h2>
			</div>
			{ability.description && (
				<p className="wpcp-tools-palette__help">{ability.description}</p>
			)}
			{form.unsupported ? (
				<Notice status="warning" isDismissible={false}>
					{reasonText(form.unsupported)}
				</Notice>
			) : (
				form.fields.map((field) => (
					<FieldRow
						key={field.key}
						field={field}
						input={input}
						errors={errors}
						set={set}
					/>
				))
			)}
			{!form.unsupported && !form.fields.length && (
				<p className="wpcp-tools-palette__help">
					{__("This ability takes no input.", "command-palette-tools")}
				</p>
			)}
		</div>
	);
};
