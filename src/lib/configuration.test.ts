import { expect } from 'chai';
import { createScheduleId, normalizeConfiguration, validateConfiguration } from './configuration';

describe('Heating Scheduler configuration', () => {
	it('normalizes a valid versioned configuration', () => {
		expect(
			normalizeConfiguration({
				schemaVersion: 3,
				schedules: [{ id: 'schedule_001', name: 'Living room' }],
				nextScheduleNumber: 2,
			}),
		).to.deep.equal({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					heatingType: 'radiator',
					setpointMappings: [],
					heatingModes: [],
					nextSetpointMappingNumber: 1,
					nextHeatingModeNumber: 1,
				},
			],
			nextScheduleNumber: 2,
		});
	});

	it('migrates the initial unversioned shape and preserves stable IDs', () => {
		expect(
			normalizeConfiguration({
				schedules: [{ id: 'stable_room', name: '  Room  ' }],
				nextScheduleNumber: 1,
			}),
		).to.deep.equal({
			schemaVersion: 3,
			schedules: [
				{
					id: 'stable_room',
					name: 'Room',
					heatingType: 'radiator',
					setpointMappings: [],
					heatingModes: [],
					nextSetpointMappingNumber: 1,
					nextHeatingModeNumber: 1,
				},
			],
			nextScheduleNumber: 1,
		});
	});

	it('normalizes legacy text enums and keeps numeric enum values', () => {
		const legacy = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					heatingType: 'underfloorHeating',
					setpointMappings: [
						{ setpointStateId: 'thermostat.setpoint', feedbackMode: 'onChange' },
						{ setpointStateId: 'thermostat.target', feedbackMode: 'cyclic', feedbackIntervalMinutes: 10 },
					],
					heatingModes: [
						{
							name: 'Away',
							weekdays: [1, 2],
							weekdaySelection: 'exclude',
							startTime: '08:00',
							temperature: 17,
						},
					],
				},
			],
			nextScheduleNumber: 2,
		});
		expect(legacy.schedules[0].setpointMappings[0].feedbackMode).to.equal(0);
		expect(legacy.schedules[0].setpointMappings[1].feedbackMode).to.equal(2);
		expect(legacy.schedules[0].heatingModes[0].weekdaySelection).to.equal(2);
		expect(legacy.schedules[0].heatingType).to.equal('underfloorHeating');

		const numeric = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					setpointMappings: [{ setpointStateId: 'thermostat.target', feedbackMode: 2 }],
					heatingModes: [{ name: 'Always', weekdaySelection: 0 }],
				},
			],
			nextScheduleNumber: 2,
		});
		expect(numeric.schedules[0].setpointMappings[0].feedbackMode).to.equal(2);
		expect(numeric.schedules[0].heatingModes[0].weekdaySelection).to.equal(0);
	});

	it('drops invalid and duplicate entries while keeping a usable configuration', () => {
		expect(
			normalizeConfiguration({
				schemaVersion: 3,
				schedules: [
					{ id: 'schedule_002', name: 'First', setpointMappings: [], heatingModes: [] },
					{ id: 'schedule_002', name: 'Duplicate ID', setpointMappings: [], heatingModes: [] },
					{ id: 'invalid id', name: 'Invalid ID', setpointMappings: [], heatingModes: [] },
					{ id: 'schedule_003', name: 'first', setpointMappings: [], heatingModes: [] },
				],
				nextScheduleNumber: 1,
			}),
		).to.deep.equal({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_002',
					name: 'First',
					heatingType: 'radiator',
					setpointMappings: [],
					heatingModes: [],
					nextSetpointMappingNumber: 1,
					nextHeatingModeNumber: 1,
				},
			],
			nextScheduleNumber: 3,
		});
	});

	it('rejects unsupported versions and reports invalid structures', () => {
		expect(normalizeConfiguration({ schemaVersion: 99, schedules: [], nextScheduleNumber: 1 })).to.deep.equal({
			schemaVersion: 3,
			schedules: [],
			nextScheduleNumber: 1,
		});
		expect(validateConfiguration({ schemaVersion: 3, schedules: [], nextScheduleNumber: 0 })).to.have.length(1);
		expect(
			validateConfiguration({
				schemaVersion: 3,
				schedules: [
					{
						id: 'schedule_001',
						name: 'Living room',
						setpointMappings: [{ feedbackMode: 3 }],
						heatingModes: [{ weekdaySelection: 3 }],
					},
				],
				nextScheduleNumber: 2,
			}),
		).to.have.length(2);
	});

	it('creates stable, non-reused-looking technical IDs', () => {
		expect(createScheduleId(1, new Set(['schedule_001']))).to.deep.equal({
			id: 'schedule_002',
			nextScheduleNumber: 3,
		});
	});
});
