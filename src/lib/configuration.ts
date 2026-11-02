/** The current version of the authoritative schedule configuration. */
export const CURRENT_SCHEMA_VERSION = 3 as const;

export type HeatingScheduleSchemaVersion = typeof CURRENT_SCHEMA_VERSION;
export type HeatingScheduleId = string;
export type HeatingScheduleSetpointMappingId = string;
export type HeatingModeId = string;

export type FeedbackMode = 0 | 1 | 2;
export type WeekdaySelection = 0 | 1 | 2;

/** 0 = on change, 1 = on update, 2 = cyclic. */
export const DEFAULT_FEEDBACK_MODE: FeedbackMode = 1;
/** 0 = all weekdays, 1 = include selected weekdays, 2 = exclude selected weekdays. */
export const DEFAULT_WEEKDAY_SELECTION: WeekdaySelection = 1;
export const DEFAULT_DEVIATION_COUNT_BEFORE_WRITE = 3;
export const DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES = 5;
export const DEFAULT_HEATING_MODE_START_TIME = '00:00';
export const DEFAULT_HEATING_MODE_TEMPERATURE = 20;
export const DEFAULT_HEATING_MODE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Returns true when the value is a supported feedback mode.
 *
 * @param value candidate value to validate
 */
export function isFeedbackMode(value: unknown): value is FeedbackMode {
	return value === 0 || value === 1 || value === 2;
}

/**
 * Returns true when the value is a supported weekday selection mode.
 *
 * @param value candidate value to validate
 */
export function isWeekdaySelection(value: unknown): value is WeekdaySelection {
	return value === 0 || value === 1 || value === 2;
}

/** A Sollwert-/Ist-Sollwert relationship configured for one schedule. */
export interface HeatingScheduleSetpointMapping {
	/** Stable technical identifier of this relationship. */
	id: HeatingScheduleSetpointMappingId;
	/** State that will receive the future Sollwert write. */
	setpointStateId: string;
	/** Optional state used for future feedback evaluation. */
	feedbackStateId?: string;
	/** Future feedback trigger mode. */
	feedbackMode: FeedbackMode;
	/** Required only for cyclic feedback evaluation. */
	feedbackIntervalMinutes?: number;
	/** Number of deviations before the future write logic is allowed to act. */
	deviationCountBeforeWrite: number;
}

/** One heating mode with one initial time rule. */
export interface HeatingMode {
	/** Stable technical identifier of this mode. */
	id: HeatingModeId;
	/** User-facing name. */
	name: string;
	/** ISO-like weekday numbers, Monday = 1 through Sunday = 7. */
	weekdays: number[];
	/** 0 = all weekdays, 1 = include listed weekdays, 2 = exclude listed weekdays. */
	weekdaySelection: WeekdaySelection;
	/** Local start time in HH:mm format. */
	startTime: string;
	/** Earliest calendar date on which the schedule may assign this mode. */
	startDate?: string;
	/** Target temperature for this initial rule. */
	temperature: number;
}

/** A schedule managed by the Heating Scheduler adapter. */
export interface HeatingSchedule {
	/** Stable technical identifier. */
	id: HeatingScheduleId;
	/** User-facing display name. */
	name: string;
	/** Independent Sollwert-/Ist-Sollwert relationships. */
	setpointMappings: HeatingScheduleSetpointMapping[];
	/** Heating modes configured below this schedule. */
	heatingModes: HeatingMode[];
	/** Next generated mapping number for this schedule. */
	nextSetpointMappingNumber: number;
	/** Next generated mode number for this schedule. */
	nextHeatingModeNumber: number;
}

/** The complete, authoritative configuration stored in `schedules.native`. */
export interface HeatingSchedulesConfiguration {
	/** Persisted schema version. */
	schemaVersion: HeatingScheduleSchemaVersion;
	/** All configured heating schedules. */
	schedules: HeatingSchedule[];
	/** Next number used for a generated technical schedule ID. */
	nextScheduleNumber: number;
}

const SCHEDULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CHILD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value.trim().replace(',', '.'));
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
	const parsed = finiteNumber(value, fallback);
	return parsed > 0 ? parsed : fallback;
}

function normalizeFeedbackMode(value: unknown): FeedbackMode {
	if (isFeedbackMode(value)) {
		return value;
	}
	if (value === 'onChange') {
		return 0;
	}
	if (value === 'cyclic') {
		return 2;
	}
	return DEFAULT_FEEDBACK_MODE;
}

function normalizeWeekdaySelection(value: unknown): WeekdaySelection {
	if (isWeekdaySelection(value)) {
		return value;
	}
	if (value === 'exclude') {
		return 2;
	}
	if (value === 'include') {
		return 1;
	}
	return DEFAULT_WEEKDAY_SELECTION;
}

function normalizeDate(value: unknown): string | undefined {
	const date = asTrimmedString(value);
	if (!DATE_PATTERN.test(date)) {
		return undefined;
	}
	const parsed = new Date(`${date}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? undefined : date;
}

function normalizeWeekdays(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [...DEFAULT_HEATING_MODE_WEEKDAYS];
	}
	const weekdays = value
		.map(day => (typeof day === 'string' && day.trim() ? Number(day) : day))
		.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7);
	const unique = [...new Set(weekdays)].sort((a, b) => a - b);
	return unique.length ? unique : [...DEFAULT_HEATING_MODE_WEEKDAYS];
}

function nextChildId(
	prefix: 'mapping' | 'mode',
	nextNumber: number,
	usedIds: ReadonlySet<string>,
): { id: string; nextNumber: number } {
	let number = positiveInteger(nextNumber, 1);
	let id = `${prefix}_${String(number).padStart(3, '0')}`;
	while (usedIds.has(id)) {
		number += 1;
		id = `${prefix}_${String(number).padStart(3, '0')}`;
	}
	return { id, nextNumber: number + 1 };
}

function normalizeChildId(
	value: unknown,
	prefix: 'mapping' | 'mode',
	nextNumber: number,
	usedIds: ReadonlySet<string>,
): { id: string; nextNumber: number } {
	const configuredId = asTrimmedString(value);
	if (configuredId && CHILD_ID_PATTERN.test(configuredId) && !usedIds.has(configuredId)) {
		const generatedNumber = new RegExp(`^${prefix}_(\\d+)$`).exec(configuredId);
		return {
			id: configuredId,
			nextNumber: generatedNumber ? Math.max(nextNumber, Number(generatedNumber[1]) + 1) : nextNumber,
		};
	}
	return nextChildId(prefix, nextNumber, usedIds);
}

function normalizeSetpointMappings(
	value: unknown,
	configuredNextNumber: unknown,
): {
	items: HeatingScheduleSetpointMapping[];
	nextNumber: number;
} {
	const items: HeatingScheduleSetpointMapping[] = [];
	const usedIds = new Set<string>();
	let nextNumber = positiveInteger(configuredNextNumber, 1);
	if (!Array.isArray(value)) {
		return { items, nextNumber };
	}

	for (const candidate of value) {
		if (!isRecord(candidate)) {
			continue;
		}
		const setpointStateId = asTrimmedString(candidate.setpointStateId);
		if (!setpointStateId) {
			continue;
		}
		const generated = normalizeChildId(candidate.id, 'mapping', nextNumber, usedIds);
		usedIds.add(generated.id);
		nextNumber = generated.nextNumber;
		const feedbackMode = normalizeFeedbackMode(candidate.feedbackMode);
		const feedbackStateId = asTrimmedString(candidate.feedbackStateId);
		items.push({
			id: generated.id,
			setpointStateId,
			...(feedbackStateId ? { feedbackStateId } : {}),
			feedbackMode,
			...(feedbackMode === 2
				? {
						feedbackIntervalMinutes: positiveNumber(
							candidate.feedbackIntervalMinutes,
							DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES,
						),
					}
				: {}),
			deviationCountBeforeWrite: positiveInteger(
				candidate.deviationCountBeforeWrite,
				DEFAULT_DEVIATION_COUNT_BEFORE_WRITE,
			),
		});
	}
	return { items, nextNumber };
}

function normalizeHeatingModes(
	value: unknown,
	configuredNextNumber: unknown,
): {
	items: HeatingMode[];
	nextNumber: number;
} {
	const items: HeatingMode[] = [];
	const usedIds = new Set<string>();
	let nextNumber = positiveInteger(configuredNextNumber, 1);
	if (!Array.isArray(value)) {
		return { items, nextNumber };
	}

	for (const candidate of value) {
		if (!isRecord(candidate)) {
			continue;
		}
		const name = asTrimmedString(candidate.name);
		if (!name) {
			continue;
		}
		const generated = normalizeChildId(candidate.id, 'mode', nextNumber, usedIds);
		usedIds.add(generated.id);
		nextNumber = generated.nextNumber;
		const startTime = asTrimmedString(candidate.startTime);
		items.push({
			id: generated.id,
			name,
			weekdays: normalizeWeekdays(candidate.weekdays),
			weekdaySelection: normalizeWeekdaySelection(candidate.weekdaySelection),
			startTime: TIME_PATTERN.test(startTime) ? startTime : DEFAULT_HEATING_MODE_START_TIME,
			...(normalizeDate(candidate.startDate) ? { startDate: normalizeDate(candidate.startDate) } : {}),
			temperature: finiteNumber(candidate.temperature, DEFAULT_HEATING_MODE_TEMPERATURE),
		});
	}
	return { items, nextNumber };
}

function normalizeSchedule(value: unknown): HeatingSchedule | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const id = asTrimmedString(value.id);
	const name = asTrimmedString(value.name);
	if (!id || !SCHEDULE_ID_PATTERN.test(id) || !name) {
		return undefined;
	}
	const mappings = normalizeSetpointMappings(value.setpointMappings, value.nextSetpointMappingNumber);
	const modes = normalizeHeatingModes(value.heatingModes, value.nextHeatingModeNumber);
	return {
		id,
		name,
		setpointMappings: mappings.items,
		heatingModes: modes.items,
		nextSetpointMappingNumber: mappings.nextNumber,
		nextHeatingModeNumber: modes.nextNumber,
	};
}

function emptyConfiguration(): HeatingSchedulesConfiguration {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		schedules: [],
		nextScheduleNumber: 1,
	};
}

/**
 * Normalizes the previous schedule configuration to the current schema.
 * Existing schedule IDs and names are copied unchanged; all new collections
 * start empty.
 *
 * @param value persisted configuration candidate
 */
export function migrateConfiguration(value: unknown): Record<string, unknown> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const version = value.schemaVersion;
	if (version === CURRENT_SCHEMA_VERSION) {
		return { ...value };
	}
	if (version === undefined || version === 1 || version === 2) {
		const schedules = Array.isArray(value.schedules)
			? value.schedules.map(schedule =>
					isRecord(schedule)
						? {
								...schedule,
								setpointMappings: Array.isArray(schedule.setpointMappings)
									? schedule.setpointMappings
									: [],
								heatingModes: Array.isArray(schedule.heatingModes) ? schedule.heatingModes : [],
								nextSetpointMappingNumber: schedule.nextSetpointMappingNumber ?? 1,
								nextHeatingModeNumber: schedule.nextHeatingModeNumber ?? 1,
							}
						: schedule,
				)
			: [];
		return {
			...value,
			schemaVersion: CURRENT_SCHEMA_VERSION,
			schedules,
		};
	}
	return undefined;
}

/**
 * Returns validation errors without mutating the supplied value.
 *
 * @param value configuration candidate
 */
export function validateConfiguration(value: unknown): string[] {
	const errors: string[] = [];
	if (!isRecord(value)) {
		return ['Configuration must be an object.'];
	}
	if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
		errors.push(`Unsupported schemaVersion: ${String(value.schemaVersion)}.`);
	}
	if (!Array.isArray(value.schedules)) {
		errors.push('schedules must be an array.');
	} else {
		const ids = new Set<string>();
		const names = new Set<string>();
		for (const [index, schedule] of value.schedules.entries()) {
			if (!isRecord(schedule)) {
				errors.push(`schedules[${index}] must be an object.`);
				continue;
			}
			const id = asTrimmedString(schedule.id);
			const name = asTrimmedString(schedule.name);
			if (!id || !SCHEDULE_ID_PATTERN.test(id)) {
				errors.push(`schedules[${index}].id is invalid.`);
			} else if (ids.has(id)) {
				errors.push(`schedules[${index}].id is duplicated.`);
			} else {
				ids.add(id);
			}
			if (!name) {
				errors.push(`schedules[${index}].name is empty.`);
			} else if (names.has(name.toLocaleLowerCase())) {
				errors.push(`schedules[${index}].name is duplicated.`);
			} else {
				names.add(name.toLocaleLowerCase());
			}
			if (!Array.isArray(schedule.setpointMappings)) {
				errors.push(`schedules[${index}].setpointMappings must be an array.`);
			} else {
				for (const [mappingIndex, mapping] of schedule.setpointMappings.entries()) {
					if (!isRecord(mapping) || !isFeedbackMode(mapping.feedbackMode)) {
						errors.push(`schedules[${index}].setpointMappings[${mappingIndex}].feedbackMode is invalid.`);
					}
				}
			}
			if (!Array.isArray(schedule.heatingModes)) {
				errors.push(`schedules[${index}].heatingModes must be an array.`);
			} else {
				for (const [modeIndex, mode] of schedule.heatingModes.entries()) {
					if (!isRecord(mode) || !isWeekdaySelection(mode.weekdaySelection)) {
						errors.push(`schedules[${index}].heatingModes[${modeIndex}].weekdaySelection is invalid.`);
					}
				}
			}
		}
	}
	if (!Number.isSafeInteger(value.nextScheduleNumber) || Number(value.nextScheduleNumber) < 1) {
		errors.push('nextScheduleNumber must be a positive safe integer.');
	}
	return errors;
}

/**
 * Normalizes persisted or legacy data into a safe, complete configuration.
 * Invalid entries are ignored, while valid technical IDs are retained.
 *
 * @param value persisted or legacy configuration candidate
 */
export function normalizeConfiguration(value: unknown): HeatingSchedulesConfiguration {
	const migrated = migrateConfiguration(value);
	if (!migrated) {
		return emptyConfiguration();
	}

	const schedules: HeatingSchedule[] = [];
	const usedIds = new Set<string>();
	const usedNames = new Set<string>();
	if (Array.isArray(migrated.schedules)) {
		for (const candidate of migrated.schedules) {
			const schedule = normalizeSchedule(candidate);
			if (!schedule) {
				continue;
			}
			const nameKey = schedule.name.toLocaleLowerCase();
			if (usedIds.has(schedule.id) || usedNames.has(nameKey)) {
				continue;
			}
			usedIds.add(schedule.id);
			usedNames.add(nameKey);
			schedules.push(schedule);
		}
	}

	const configuredNext = positiveInteger(migrated.nextScheduleNumber, 1);
	const largestGeneratedNumber = schedules.reduce((largest, schedule) => {
		const match = /^schedule_(\d+)$/.exec(schedule.id);
		return match ? Math.max(largest, Number(match[1])) : largest;
	}, 0);

	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		schedules,
		nextScheduleNumber: Math.max(configuredNext, largestGeneratedNumber + 1, 1),
	};
}

/**
 * Returns true when the configuration has no configured schedules.
 *
 * @param configuration configuration to inspect
 */
export function isEmptyConfiguration(configuration: HeatingSchedulesConfiguration): boolean {
	return configuration.schedules.length === 0;
}

/**
 * Returns the next stable technical schedule ID and the following counter.
 *
 * @param nextScheduleNumber next number proposed by the configuration
 * @param usedIds technical schedule IDs that are already in use
 */
export function createScheduleId(
	nextScheduleNumber: number,
	usedIds: ReadonlySet<string>,
): { id: HeatingScheduleId; nextScheduleNumber: number } {
	let number = positiveInteger(nextScheduleNumber, 1);
	let id = `schedule_${String(number).padStart(3, '0')}`;
	while (usedIds.has(id)) {
		number += 1;
		id = `schedule_${String(number).padStart(3, '0')}`;
	}
	return { id, nextScheduleNumber: number + 1 };
}

/**
 * Returns the next stable child ID and the following per-schedule counter.
 *
 * @param prefix child ID prefix to generate
 * @param nextNumber next number proposed by the schedule
 * @param usedIds child IDs that are already in use
 */
export function createChildId(
	prefix: 'mapping' | 'mode',
	nextNumber: number,
	usedIds: ReadonlySet<string>,
): { id: string; nextNumber: number } {
	return nextChildId(prefix, nextNumber, usedIds);
}
