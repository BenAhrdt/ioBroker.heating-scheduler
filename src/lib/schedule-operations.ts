import {
	DEFAULT_HEATING_TYPE,
	DEFAULT_FEEDBACK_MODE,
	createScheduleId,
	createChildId,
	isFeedbackMode,
	isValidCalendarDate,
	isHeatingType,
	isWeekdaySelection,
	normalizeConfiguration,
	type HeatingType,
	type HeatingSchedulesConfiguration,
} from './configuration';

/** Editable schedule configuration submitted by the configuration dialog. */
export interface HeatingScheduleConfigurationPatch {
	/** User-facing schedule name. */
	name: string;
	/** Optional heating system type; existing schedules default to a radiator. */
	heatingType?: HeatingType;
	/** Optional schedule activation date. */
	startDate?: string;
	/** Optional schedule deactivation date. */
	endDate?: string;
	/** Setpoint and feedback mappings submitted by the dialog. */
	setpointMappings: unknown[];
	/** Heating modes submitted by the dialog. */
	heatingModes: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateConfigurationPatch(patch: HeatingScheduleConfigurationPatch): void {
	if (patch.heatingType !== undefined && !isHeatingType(patch.heatingType)) {
		throw new Error('The heating system type is invalid');
	}
	if (!Array.isArray(patch.setpointMappings) || !Array.isArray(patch.heatingModes)) {
		throw new Error('The schedule configuration collections must be arrays');
	}
	if (patch.startDate !== undefined && patch.startDate !== '' && !isValidCalendarDate(patch.startDate)) {
		throw new Error('The schedule start date must use YYYY-MM-DD');
	}
	if (patch.endDate !== undefined && patch.endDate !== '' && !isValidCalendarDate(patch.endDate)) {
		throw new Error('The schedule end date must use YYYY-MM-DD');
	}
	for (const [index, candidate] of patch.setpointMappings.entries()) {
		if (!isRecord(candidate)) {
			throw new Error(`Setpoint mapping ${index + 1} is invalid`);
		}
		if (typeof candidate.setpointStateId !== 'string' || !candidate.setpointStateId.trim()) {
			throw new Error(`Setpoint mapping ${index + 1} needs a Sollwert state ID`);
		}
		if (candidate.feedbackStateId !== undefined && typeof candidate.feedbackStateId !== 'string') {
			throw new Error(`Setpoint mapping ${index + 1} has an invalid feedback state ID`);
		}
		const feedbackMode =
			candidate.feedbackMode === undefined || candidate.feedbackMode === ''
				? DEFAULT_FEEDBACK_MODE
				: candidate.feedbackMode;
		if (!isFeedbackMode(feedbackMode)) {
			throw new Error(`Setpoint mapping ${index + 1} has an invalid feedback mode`);
		}
		if (
			feedbackMode === 2 &&
			(typeof candidate.feedbackIntervalMinutes !== 'number' ||
				!Number.isFinite(candidate.feedbackIntervalMinutes) ||
				candidate.feedbackIntervalMinutes <= 0)
		) {
			throw new Error(`Setpoint mapping ${index + 1} needs a positive cyclic interval`);
		}
		if (
			candidate.deviationCountBeforeWrite !== undefined &&
			(typeof candidate.deviationCountBeforeWrite !== 'number' ||
				!Number.isSafeInteger(candidate.deviationCountBeforeWrite) ||
				candidate.deviationCountBeforeWrite < 1)
		) {
			throw new Error(`Setpoint mapping ${index + 1} needs a positive deviation count`);
		}
	}
	for (const [index, candidate] of patch.heatingModes.entries()) {
		if (!isRecord(candidate)) {
			throw new Error(`Heating mode ${index + 1} is invalid`);
		}
		if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
			throw new Error(`Heating mode ${index + 1} needs a name`);
		}
		if (!Array.isArray(candidate.weekdays) || !candidate.weekdays.length) {
			throw new Error(`Heating mode ${index + 1} needs at least one weekday`);
		}
		if (!candidate.weekdays.every(day => Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 7)) {
			throw new Error(`Heating mode ${index + 1} contains an invalid weekday`);
		}
		if (!isWeekdaySelection(candidate.weekdaySelection)) {
			throw new Error(`Heating mode ${index + 1} has an invalid weekday selection`);
		}
		if (typeof candidate.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.startTime)) {
			throw new Error(`Heating mode ${index + 1} needs a valid HH:mm start time`);
		}
		if (
			candidate.startDate !== undefined &&
			candidate.startDate !== '' &&
			!isValidCalendarDate(candidate.startDate)
		) {
			throw new Error(`Heating mode ${index + 1} needs a valid YYYY-MM-DD start date`);
		}
		if (candidate.endDate !== undefined && candidate.endDate !== '' && !isValidCalendarDate(candidate.endDate)) {
			throw new Error(`Heating mode ${index + 1} needs a valid YYYY-MM-DD end date`);
		}
		if (typeof candidate.temperature !== 'number' || !Number.isFinite(candidate.temperature)) {
			throw new Error(`Heating mode ${index + 1} needs a finite temperature`);
		}
	}
}

function validateName(configuration: HeatingSchedulesConfiguration, name: string, currentId?: string): string {
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	if (!normalizedName) {
		throw new Error('The schedule display name must not be empty');
	}
	const duplicate = configuration.schedules.find(
		schedule =>
			schedule.id !== currentId &&
			schedule.name.localeCompare(normalizedName, undefined, { sensitivity: 'accent' }) === 0,
	);
	if (duplicate) {
		throw new Error(`The schedule name is already used by ${duplicate.id}`);
	}
	return normalizedName;
}

/**
 * Adds a schedule while keeping its technical ID independent from its name.
 *
 * @param configuration current configuration
 * @param name requested display name
 * @param heatingType heating system type
 */
export function addScheduleToConfiguration(
	configuration: HeatingSchedulesConfiguration,
	name: string,
	heatingType: HeatingType = DEFAULT_HEATING_TYPE,
): { configuration: HeatingSchedulesConfiguration; id: string } {
	const normalizedName = validateName(configuration, name);
	if (!isHeatingType(heatingType)) {
		throw new Error('The heating system type is invalid');
	}
	const created = createScheduleId(
		configuration.nextScheduleNumber,
		new Set(configuration.schedules.map(schedule => schedule.id)),
	);
	return {
		id: created.id,
		configuration: {
			...configuration,
			schedules: [
				...configuration.schedules,
				{
					id: created.id,
					name: normalizedName,
					heatingType,
					setpointMappings: [],
					heatingModes: [],
					nextSetpointMappingNumber: 1,
					nextHeatingModeNumber: 1,
				},
			],
			nextScheduleNumber: created.nextScheduleNumber,
		},
	};
}

/**
 * Renames a schedule without changing its technical ID.
 *
 * @param configuration current configuration
 * @param id stable technical ID
 * @param name requested display name
 * @param heatingType optional heating system type
 */
export function renameScheduleInConfiguration(
	configuration: HeatingSchedulesConfiguration,
	id: string,
	name: string,
	heatingType?: HeatingType,
): HeatingSchedulesConfiguration {
	if (!configuration.schedules.some(schedule => schedule.id === id)) {
		throw new Error(`Schedule ${id} does not exist`);
	}
	const normalizedName = validateName(configuration, name, id);
	if (heatingType !== undefined && !isHeatingType(heatingType)) {
		throw new Error('The heating system type is invalid');
	}
	return {
		...configuration,
		schedules: configuration.schedules.map(schedule =>
			schedule.id === id
				? { ...schedule, name: normalizedName, ...(heatingType ? { heatingType } : {}) }
				: schedule,
		),
	};
}

/**
 * Removes a schedule while leaving the ID counter untouched to avoid ID reuse.
 *
 * @param configuration current configuration
 * @param id stable technical ID
 */
export function removeScheduleFromConfiguration(
	configuration: HeatingSchedulesConfiguration,
	id: string,
): HeatingSchedulesConfiguration {
	if (!configuration.schedules.some(schedule => schedule.id === id)) {
		throw new Error(`Schedule ${id} does not exist`);
	}
	return {
		...configuration,
		schedules: configuration.schedules.filter(schedule => schedule.id !== id),
	};
}

/**
 * Replaces the editable configuration of one schedule and normalizes all child
 * entries before the result is persisted.
 *
 * @param configuration current configuration
 * @param id stable schedule ID
 * @param patch submitted schedule configuration
 * @param validNumericStateIds optional set of existing number state IDs
 */
export function updateScheduleConfiguration(
	configuration: HeatingSchedulesConfiguration,
	id: string,
	patch: HeatingScheduleConfigurationPatch,
	validNumericStateIds?: ReadonlySet<string>,
): HeatingSchedulesConfiguration {
	const schedule = configuration.schedules.find(entry => entry.id === id);
	if (!schedule) {
		throw new Error(`Schedule ${id} does not exist`);
	}
	validateConfigurationPatch(patch);
	if (validNumericStateIds) {
		for (const [index, candidate] of patch.setpointMappings.entries()) {
			const setpointStateId =
				typeof candidate === 'object' && candidate
					? (candidate as Record<string, unknown>).setpointStateId
					: undefined;
			const feedbackStateId =
				typeof candidate === 'object' && candidate
					? (candidate as Record<string, unknown>).feedbackStateId
					: undefined;
			if (typeof setpointStateId !== 'string' || !validNumericStateIds.has(setpointStateId.trim())) {
				throw new Error(`Setpoint mapping ${index + 1} must use an existing number Sollwert state`);
			}
			if (
				typeof feedbackStateId === 'string' &&
				feedbackStateId.trim() &&
				!validNumericStateIds.has(feedbackStateId.trim())
			) {
				throw new Error(`Setpoint mapping ${index + 1} must use an existing number feedback state`);
			}
		}
	}
	const normalizedName = validateName(configuration, patch.name, id);
	const existingMappingIds = new Set(schedule.setpointMappings.map(mapping => mapping.id));
	const usedMappingIds = new Set(existingMappingIds);
	let nextMappingNumber = schedule.nextSetpointMappingNumber;
	const setpointMappings = patch.setpointMappings.map(candidate => {
		const record = candidate as Record<string, unknown>;
		const candidateId = typeof record.id === 'string' ? record.id.trim() : '';
		if (candidateId && existingMappingIds.has(candidateId)) {
			const existing = schedule.setpointMappings.find(mapping => mapping.id === candidateId);
			if (!existing) {
				throw new Error(`Setpoint mapping ${candidateId} does not exist`);
			}
			return {
				...record,
				id: existing.id,
				setpointStateId: (record.setpointStateId as string).trim(),
				...(typeof record.feedbackStateId === 'string' && record.feedbackStateId.trim()
					? { feedbackStateId: record.feedbackStateId.trim() }
					: {}),
			};
		}
		const created = createChildId('mapping', nextMappingNumber, usedMappingIds);
		usedMappingIds.add(created.id);
		nextMappingNumber = created.nextNumber;
		return {
			...record,
			id: created.id,
		};
	});
	const existingModeIds = new Set(schedule.heatingModes.map(mode => mode.id));
	const heatingModes = patch.heatingModes.map(candidate => {
		const record = candidate as Record<string, unknown>;
		const candidateId = typeof record.id === 'string' ? record.id.trim() : '';
		return candidateId && existingModeIds.has(candidateId)
			? { ...record, id: candidateId }
			: { ...record, id: undefined };
	});
	return normalizeConfiguration({
		...configuration,
		schedules: configuration.schedules.map(entry =>
			entry.id === id
				? {
						...entry,
						name: normalizedName,
						heatingType: patch.heatingType ?? entry.heatingType,
						startDate: patch.startDate !== undefined ? patch.startDate || undefined : entry.startDate,
						endDate: patch.endDate !== undefined ? patch.endDate || undefined : entry.endDate,
						setpointMappings,
						nextSetpointMappingNumber: nextMappingNumber,
						heatingModes,
					}
				: entry,
		),
	});
}
