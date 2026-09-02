<?php
/**
 * Pieces the bundled abilities share: schema fragments, and the reading of an
 * input that may not be there at all.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

// An ability with no top-level default reaches its callback with null.
function wpcp_tools_input($input, $key, $default = null)
{
	if (!is_array($input) || !isset($input[$key])) return $default;
	if (is_string($input[$key]) && trim($input[$key]) === '') return $default;

	return $input[$key];
}

// An empty enum renders a Select with no options, which is a dead end.
function wpcp_tools_choice_field(array $field, array $values)
{
	$values = array_values(array_unique($values));

	return array_merge($field, ['type' => 'string'], $values ? ['enum' => $values] : []);
}

// Attachments are left out: nothing here edits a file.
function wpcp_tools_post_types()
{
	$types = get_post_types(['public' => true], 'names');
	unset($types['attachment']);

	return array_values($types);
}

function wpcp_tools_taxonomies()
{
	return array_values(get_taxonomies(['public' => true], 'names'));
}

// Bounds every write loop so one run cannot walk a whole table into a timeout.
function wpcp_tools_limit_field($default, $max = 500)
{
	return [
		'type' => 'integer',
		'title' => __('Limit', 'command-palette-tools'),
		'description' => __('How many to work through in one run.', 'command-palette-tools'),
		'minimum' => 1,
		'maximum' => $max,
		'default' => $default,
	];
}

function wpcp_tools_bounded_limit($input, $default, $max = 500)
{
	return max(1, min($max, (int) wpcp_tools_input($input, 'limit', $default)));
}

function wpcp_tools_chosen_post_types($input)
{
	$chosen = wpcp_tools_input($input, 'post_type');
	$types = wpcp_tools_post_types();

	return $chosen && in_array($chosen, $types, true) ? [$chosen] : $types;
}

// Built from a count, never from anything a caller sent.
function wpcp_tools_placeholders(array $values, $format = '%s')
{
	return implode(',', array_fill(0, max(1, count($values)), $format));
}

function wpcp_tools_post_type_field()
{
	return wpcp_tools_choice_field([
		'title' => __('Post type', 'command-palette-tools'),
		'description' => __('Leave unset to cover every post type.', 'command-palette-tools'),
	], wpcp_tools_post_types());
}

// One gate for everything this plugin registers. These are all site-maintenance
// jobs, and the palette that lists them asks for the same capability.
function wpcp_tools_can_run_maintenance()
{
	return current_user_can('manage_options');
}

// Answered with no input, so a yes is trustworthy and a no often is not.
// Null is neither: unknown, and never treated as a refusal.
function wpcp_tools_can_run_ability($ability)
{
	try {
		$allowed = $ability->check_permissions();
	} catch (Throwable $e) {
		return null;
	}

	if ($allowed === true) return true;

	// WooCommerce checks edit_product against the id it was passed, so asking
	// with nothing gets a no from an ability the user can plainly run.
	return wpcp_tools_needs_input($ability) ? null : false;
}

function wpcp_tools_needs_input($ability)
{
	$schema = $ability->get_input_schema();
	if (!is_array($schema) || !$schema) return false;
	if (!empty($schema['required'])) return true;

	// A union says nothing at the top level; every branch carries the requirement.
	foreach (['oneOf', 'anyOf', 'allOf', 'not', '$ref'] as $keyword) {
		if (isset($schema[$keyword])) return true;
	}

	return false;
}

// Not a way around show_in_rest: the same set, listed better.
function wpcp_tools_visible_ability($ability)
{
	return (bool) $ability->get_meta_item('show_in_rest', false);
}
