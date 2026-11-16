<?php
/**
 * ORION Telemetry System - Live Status & Connection Badge Endpoint (GET)
 * Alias endpoint for get_data.php exposing TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= 15 live status.
 */
require __DIR__ . '/get_data.php';

