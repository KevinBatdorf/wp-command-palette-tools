<?php
/**
 * Abilities about the abilities. Core's REST listing answers "what is
 * registered"; these answer "what can I, right now, actually run".
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

add_action('wp_abilities_api_init', function () {
	wp_register_ability('wpcp/list-abilities', [
		'label' => __('List abilities', 'command-palette-tools'),
		'description' => __('Every ability registered on this site, filtered how you ask, and whether you are allowed to run it. The REST listing core provides is gated on nothing but being logged in, so it will happily show you abilities that answer 403.', 'command-palette-tools'),
		'category' => 'abilities',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'search' => [
					'type' => 'string',
					'title' => __('Search', 'command-palette-tools'),
					'description' => __('Matched against the name, label and description.', 'command-palette-tools'),
				],
				'namespace' => [
					'type' => 'string',
					'title' => __('Namespace', 'command-palette-tools'),
					'description' => __('The part before the slash, such as core.', 'command-palette-tools'),
				],
				'category' => wpcp_tools_choice_field([
					'title' => __('Category', 'command-palette-tools'),
				], wpcp_tools_ability_categories()),
				'only_runnable' => [
					'type' => 'boolean',
					'title' => __('Only ones I can run', 'command-palette-tools'),
					'default' => false,
				],
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('read'),
		'execute_callback' => 'wpcp_tools_list_abilities',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/describe-ability', [
		'label' => __('Describe an ability', 'command-palette-tools'),
		'description' => __('Everything one ability declares: what it takes, what it returns, whether it is destructive, and whether you may run it.', 'command-palette-tools'),
		'category' => 'abilities',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'name' => [
					'type' => 'string',
					'title' => __('Ability', 'command-palette-tools'),
					'description' => __('The full name, such as core/get-site-info.', 'command-palette-tools'),
					'minLength' => 1,
				],
			],
			'required' => ['name'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('read'),
		'execute_callback' => 'wpcp_tools_describe_ability',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true],
		],
	]);
});

function wpcp_tools_ability_categories()
{
	return array_map(fn($category) => $category->get_slug(), array_values(wp_get_ability_categories()));
}

// Another plugin's callback can throw on null input; unknown is not a refusal.
function wpcp_tools_can_run_ability($ability)
{
	try {
		$allowed = $ability->check_permissions();
	} catch (Throwable $e) {
		return null;
	}

	return is_wp_error($allowed) ? false : (bool) $allowed;
}

// Not a way around show_in_rest: the same set, listed better.
function wpcp_tools_visible_ability($ability)
{
	return (bool) $ability->get_meta_item('show_in_rest', false);
}

function wpcp_tools_list_abilities($input)
{
	$search = (string) wpcp_tools_input($input, 'search', '');
	$namespace = (string) wpcp_tools_input($input, 'namespace', '');
	$category = (string) wpcp_tools_input($input, 'category', '');
	$only_runnable = (bool) wpcp_tools_input($input, 'only_runnable', false);

	$found = [];
	foreach (wp_get_abilities([]) as $ability) {
		if (!wpcp_tools_visible_ability($ability)) continue;

		$name = $ability->get_name();
		if ($namespace !== '' && strpos($name, rtrim($namespace, '/') . '/') !== 0) continue;
		if ($category !== '' && $ability->get_category() !== $category) continue;

		$haystack = $name . ' ' . $ability->get_label() . ' ' . $ability->get_description();
		if ($search !== '' && stripos($haystack, $search) === false) continue;

		$can_run = wpcp_tools_can_run_ability($ability);
		if ($only_runnable && $can_run !== true) continue;

		$found[] = [
			'name' => $name,
			'label' => $ability->get_label(),
			'description' => $ability->get_description(),
			'category' => $ability->get_category(),
			'annotations' => (array) $ability->get_meta_item('annotations', []),
			'can_run' => $can_run,
		];
	}

	usort($found, fn($a, $b) => strcmp($a['name'], $b['name']));

	return ['abilities' => $found, 'total' => count($found)];
}

function wpcp_tools_describe_ability($input)
{
	$name = (string) wpcp_tools_input($input, 'name', '');
	$ability = $name === '' ? null : wp_get_ability($name);

	if (!$ability || !wpcp_tools_visible_ability($ability)) {
		return new WP_Error(
			'wpcp_tools_ability_not_found',
			/* translators: %s: ability name. */
			sprintf(__('No ability called "%s" is registered here.', 'command-palette-tools'), $name),
			['status' => 404]
		);
	}

	return [
		'name' => $ability->get_name(),
		'label' => $ability->get_label(),
		'description' => $ability->get_description(),
		'category' => $ability->get_category(),
		'annotations' => (array) $ability->get_meta_item('annotations', []),
		'input_schema' => wp_prepare_json_schema_for_client((array) $ability->get_input_schema()),
		'output_schema' => wp_prepare_json_schema_for_client((array) $ability->get_output_schema()),
		'can_run' => wpcp_tools_can_run_ability($ability),
	];
}
