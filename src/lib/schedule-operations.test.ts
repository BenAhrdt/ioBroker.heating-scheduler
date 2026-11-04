import { expect } from 'chai';
import {
	addScheduleToConfiguration,
	removeScheduleFromConfiguration,
	renameScheduleInConfiguration,
	updateScheduleConfiguration,
} from './schedule-operations';

describe('Heating Modes schedule operations', () => {
	const initial = {
		schemaVersion: 3 as const,
		schedules: [
			{
				id: 'schedule_001',
				name: 'Living room',
				heatingType: 'radiator' as const,
				setpointMappings: [],
				heatingModes: [],
				nextSetpointMappingNumber: 1,
				nextHeatingModeNumber: 1,
			},
		],
		nextScheduleNumber: 2,
	};

	it('adds a schedule with a stable technical ID', () => {
		const result = addScheduleToConfiguration(initial, 'Bedroom');
		expect(result.id).to.equal('schedule_002');
		expect(result.configuration.schedules.map(({ id, name }) => ({ id, name }))).to.deep.equal([
			{ id: 'schedule_001', name: 'Living room' },
			{ id: 'schedule_002', name: 'Bedroom' },
		]);
	});

	it('renames without changing the technical ID', () => {
		expect(
			renameScheduleInConfiguration(initial, 'schedule_001', 'Lounge').schedules.map(({ id, name }) => ({
				id,
				name,
			})),
		).to.deep.equal([{ id: 'schedule_001', name: 'Lounge' }]);
	});

	it('deletes a schedule and reuses the now-free number', () => {
		const afterDelete = removeScheduleFromConfiguration(initial, 'schedule_001');
		expect(afterDelete).to.deep.equal({ schemaVersion: 3, schedules: [], nextScheduleNumber: 2 });
		const next = addScheduleToConfiguration(afterDelete, 'New room');
		expect(next.id).to.equal('schedule_001');
	});

	it('rejects empty and duplicate display names', () => {
		expect(() => addScheduleToConfiguration(initial, '  ')).to.throw('must not be empty');
		expect(() => addScheduleToConfiguration(initial, 'LIVING ROOM')).to.throw('already used');
	});

	it('allows changing mapped state IDs to other valid number states', () => {
		const withMapping = {
			...initial,
			schedules: [
				{
					...initial.schedules[0],
					setpointMappings: [
						{
							id: 'mapping_001',
							setpointStateId: 'old.setpoint',
							feedbackStateId: 'old.feedback',
							feedbackMode: 1 as const,
							deviationCountBeforeWrite: 3,
						},
					],
				},
			],
		};
		const changed = updateScheduleConfiguration(
			withMapping,
			'schedule_001',
			{
				name: 'Living room',
				heatingType: 'underfloorHeating',
				setpointMappings: [
					{
						id: 'mapping_001',
						setpointStateId: 'new.setpoint',
						feedbackStateId: 'new.feedback',
						feedbackMode: 1,
						deviationCountBeforeWrite: 3,
					},
				],
				heatingModes: [],
			},
			new Set(['old.setpoint', 'old.feedback', 'new.setpoint', 'new.feedback']),
		);
		expect(changed.schedules[0].setpointMappings[0]).to.include({
			setpointStateId: 'new.setpoint',
			feedbackStateId: 'new.feedback',
		});
		expect(changed.schedules[0].heatingType).to.equal('underfloorHeating');
	});

	it('stores optional schedule and heating-mode activation dates', () => {
		const changed = updateScheduleConfiguration(initial, 'schedule_001', {
			name: 'Living room',
			startDate: '2026-11-03',
			endDate: '2026-12-01',
			setpointMappings: [],
			heatingModes: [
				{
					name: 'Comfort',
					weekdays: [1, 2, 3, 4, 5],
					weekdaySelection: 1,
					startTime: '08:00',
					startDate: '2026-11-05',
					endDate: '2026-11-20',
					temperature: 21,
				},
			],
		});

		expect(changed.schedules[0]).to.include({
			startDate: '2026-11-03',
			endDate: '2026-12-01',
		});
		expect(changed.schedules[0].heatingModes[0]).to.include({
			startDate: '2026-11-05',
			endDate: '2026-11-20',
		});
		const reversed = updateScheduleConfiguration(initial, 'schedule_001', {
			name: 'Living room',
			startDate: '2026-12-01',
			endDate: '2026-11-03',
			setpointMappings: [],
			heatingModes: [],
		});
		expect(reversed.schedules[0]).to.include({
			startDate: '2026-12-01',
			endDate: '2026-11-03',
		});
	});
});
