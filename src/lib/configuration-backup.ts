import { isDeepStrictEqual } from 'node:util';
import { isEmptyConfiguration, normalizeConfiguration, type HeatingSchedulesConfiguration } from './configuration';

/**
 * Returns whether the exact schedules-folder native differs from its backup.
 *
 * @param schedulesNative current schedules-folder native
 * @param backup stored instance backup
 */
export function configurationBackupNeedsUpdate(
	schedulesNative: HeatingSchedulesConfiguration,
	backup: unknown,
): boolean {
	return !isDeepStrictEqual(schedulesNative, backup);
}

/**
 * Validates and normalizes an instance backup for restoration.
 * Empty and malformed backups are intentionally not restorable.
 *
 * @param value stored instance backup candidate
 */
export function getRestorableConfigurationBackup(value: unknown): HeatingSchedulesConfiguration | undefined {
	const configuration = normalizeConfiguration(value);
	return isEmptyConfiguration(configuration) ? undefined : configuration;
}
