import { expect } from 'chai';
import { configurationBackupNeedsUpdate, getRestorableConfigurationBackup } from './configuration-backup';

describe('Heating Scheduler configuration backup', () => {
	const configuration = {
		schemaVersion: 3 as const,
		schedules: [
			{
				id: 'schedule_001',
				name: 'Living room',
				setpointMappings: [],
				heatingModes: [],
				nextSetpointMappingNumber: 1,
				nextHeatingModeNumber: 1,
			},
		],
		nextScheduleNumber: 2,
	};

	it('does not update an identical backup', () => {
		expect(configurationBackupNeedsUpdate(configuration, structuredClone(configuration))).to.equal(false);
	});

	it('detects deeply nested configuration changes', () => {
		const backup = structuredClone(configuration);
		backup.schedules[0].name = 'Old name';
		expect(configurationBackupNeedsUpdate(configuration, backup)).to.equal(true);
	});

	it('requires an update when no backup exists', () => {
		expect(configurationBackupNeedsUpdate(configuration, undefined)).to.equal(true);
	});

	it('restores only a non-empty, valid backup', () => {
		expect(getRestorableConfigurationBackup(configuration)).to.deep.equal(configuration);
		expect(getRestorableConfigurationBackup(undefined)).to.equal(undefined);
		expect(getRestorableConfigurationBackup({ schemaVersion: 3, schedules: [], nextScheduleNumber: 1 })).to.equal(
			undefined,
		);
		expect(
			getRestorableConfigurationBackup({ schemaVersion: 3, schedules: 'corrupt', nextScheduleNumber: 1 }),
		).to.equal(undefined);
	});
});
