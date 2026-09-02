<?php
/**
 * Plugin Name: No core command palette
 * Description: Removes core's command palette from every admin screen.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

remove_action('admin_enqueue_scripts', 'wp_enqueue_command_palette_assets');
