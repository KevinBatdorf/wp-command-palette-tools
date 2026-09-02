<?php
/**
 * Plugin Name:       Command Palette Tools
 * Description:       A collection of productivity tools for the WordPress Command Palette
 * Requires at least: 6.9
 * Requires PHP:      7.0
 * Version:           1.0.1
 * Author:            Kevin Batdorf
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       command-palette-tools
 *
 * @package           kevinbatdorf
 */

defined('ABSPATH') or die;

// `Requires at least` does not stop an installed copy running on 6.3-6.8.
function wpcp_tools_has_abilities_api()
{
	return function_exists('wp_register_ability') && function_exists('wp_get_abilities');
}

if (wpcp_tools_has_abilities_api()) {
	require_once plugin_dir_path(__FILE__) . 'includes/abilities.php';
}

function wpcp_tools_palette_enabled()
{
	if (defined('disable_wpcp_tools_palette')) return false;
	if (is_network_admin() || is_user_admin()) return false;
	if (!wpcp_tools_has_abilities_api()) return false;

	return current_user_can('edit_posts');
}

add_action('admin_enqueue_scripts', function () {
	if (!wpcp_tools_palette_enabled()) return;

	$deps = require plugin_dir_path(__FILE__) . 'build/palette.asset.php';
	wp_enqueue_script(
		'kevinbatdorf/wpcp-tools-palette',
		plugins_url('build/palette.js', __FILE__),
		$deps['dependencies'],
		$deps['version'],
		true
	);
	wp_set_script_translations('kevinbatdorf/wpcp-tools-palette', 'command-palette-tools');
	// Core's own stylesheets; without them the palette renders unstyled.
	wp_enqueue_style(
		'kevinbatdorf/wpcp-tools-palette',
		plugins_url('build/palette.css', __FILE__),
		['wp-components', 'wp-commands'],
		$deps['version']
	);
	wp_style_add_data('kevinbatdorf/wpcp-tools-palette', 'rtl', 'replace');
});

add_action('admin_bar_menu', function ($wp_admin_bar) {
	if (!is_admin() || !wpcp_tools_palette_enabled()) return;

	$wp_admin_bar->add_node([
		'id' => 'wpcp-tools-palette',
		'title' => __('Abilities', 'command-palette-tools'),
		'href' => '#',
	]);
}, 100);

$wpcp_tools_assets = ['math', 'color', 'fun'];

add_action('enqueue_block_editor_assets', function () use ($wpcp_tools_assets) {
    foreach($wpcp_tools_assets as $asset) {
        if (defined("disable_wpcp_tools_$asset")) continue;

        $deps = require plugin_dir_path(__FILE__) . "build/$asset.asset.php";
		wp_enqueue_script(
			"kevinbatdorf/wpcp-tools-$asset",
			plugins_url("build/$asset.js", __FILE__),
			$deps['dependencies'],
			$deps['version'],
			true
		);
		wp_enqueue_style(
			"kevinbatdorf/wpcp-tools-$asset",
			plugins_url("build/$asset.css", __FILE__),
			[],
			$deps['version']
		);
    }
});

add_action('init', function () use ($wpcp_tools_assets) {
    foreach($wpcp_tools_assets as $asset) {
        if (defined("disable_wpcp_tools_$asset")) continue;

        wp_set_script_translations("kevinbatdorf/wpcp-tools-$asset", 'command-palette-tools');
    }
});
