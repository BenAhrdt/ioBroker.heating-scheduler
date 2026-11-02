import type { HeatingSchedulesConfiguration } from './configuration';

declare global {
	namespace ioBroker {
		interface AdapterConfig {
			/** Minutes of inactivity before the schedules-folder configuration is backed up. Zero disables it. */
			configurationBackupDelayMinutes?: number;
			/** Exact copy of the native content of the adapter's schedules folder. */
			scheduleConfigurationBackup?: HeatingSchedulesConfiguration;
		}
	}
}

export {};
