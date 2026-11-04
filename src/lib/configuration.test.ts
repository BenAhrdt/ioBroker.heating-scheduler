import { expect } from 'chai';
import {
	createScheduleId,
	isDateInActivationRange,
	isValidDateRange,
	normalizeConfiguration,
	selectHeatingModeForManualActivation,
	validateConfiguration,
} from './configuration';

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

	it('normalizes optional activation dates for schedules and heating modes', () => {
		const configuration = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					startDate: '2026-11-03',
					endDate: '2026-12-01',
					heatingModes: [
						{
							name: 'Comfort',
							startDate: '2026-11-05',
							endDate: '2026-11-20',
						},
					],
				},
			],
			nextScheduleNumber: 2,
		});

		expect(configuration.schedules[0]).to.include({
			startDate: '2026-11-03',
			endDate: '2026-12-01',
		});
		expect(configuration.schedules[0].heatingModes[0]).to.include({
			startDate: '2026-11-05',
			endDate: '2026-11-20',
		});
		expect(isValidDateRange('2026-11-03', '2026-12-01')).to.equal(true);
		expect(isValidDateRange('2026-12-01', '2026-11-03')).to.equal(true);
		expect(isDateInActivationRange('2026-11-05', '2026-11-03', '2026-12-01')).to.equal(true);
		expect(isDateInActivationRange('2026-12-01', '2026-11-03', '2026-12-01')).to.equal(false);
		expect(isDateInActivationRange('2026-11-15', '2026-12-01', '2026-11-03', false)).to.equal(false);
		expect(isDateInActivationRange('2026-12-02', '2026-12-01', '2026-11-03', false)).to.equal(true);
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

	it('creates the smallest free technical schedule ID', () => {
		expect(createScheduleId(99, new Set(['schedule_001', 'schedule_002', 'schedule_005']))).to.deep.equal({
			id: 'schedule_003',
			nextScheduleNumber: 4,
		});
	});

	it('selects the most recent applicable heating mode for manual activation', () => {
		const schedule = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					heatingModes: [
						{ name: 'Noon', startTime: '12:00', temperature: 21 },
						{ name: 'Afternoon', startTime: '13:00', temperature: 22 },
					],
				},
			],
			nextScheduleNumber: 2,
		}).schedules[0];

		expect(selectHeatingModeForManualActivation(schedule, 1, 12 * 60 + 30)?.name).to.equal('Noon');
	});

	it('falls back to the last matching weekday rule', () => {
		const schedule = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					heatingModes: [
						{
							name: 'Weekday comfort',
							weekdays: [1, 2, 3, 4, 5],
							weekdaySelection: 1,
							startTime: '12:00',
						},
					],
				},
			],
			nextScheduleNumber: 2,
		}).schedules[0];

		expect(selectHeatingModeForManualActivation(schedule, 6, 12 * 60 + 30)?.name).to.equal('Weekday comfort');
	});

	it('can restrict manual selection to the current weekday', () => {
		const schedule = normalizeConfiguration({
			schemaVersion: 3,
			schedules: [
				{
					id: 'schedule_001',
					name: 'Living room',
					heatingModes: [
						{
							name: 'Weekday comfort',
							weekdays: [1, 2, 3, 4, 5],
							weekdaySelection: 1,
							startTime: '12:00',
						},
					],
				},
			],
			nextScheduleNumber: 2,
		}).schedules[0];

		expect(selectHeatingModeForManualActivation(schedule, 6, 12 * 60 + 30, false)).to.equal(undefined);
	});
});
