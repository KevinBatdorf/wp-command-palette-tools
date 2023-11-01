<?php
/**
 * Plugin Name:       Command Palette Tools
 * Description:       A collection of productivity tools for the WordPress Command Palette
 * Requires at least: 6.3
 * Requires PHP:      7.0
 * Version:           1.0.0
 * Author:            Kevin Batdorf
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wpcp-tools
 *
 * @package           kevinbatdorf
 */

defined('ABSPATH') or die;

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

        wp_set_script_translations("kevinbatdorf/wpcp-tools-$asset", 'wpcp-tools');
    }
});
