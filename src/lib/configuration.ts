/** The current version of the authoritative schedule configuration. */
export const CURRENT_SCHEMA_VERSION = 3 as const;

export type HeatingScheduleSchemaVersion = typeof CURRENT_SCHEMA_VERSION;
export type HeatingScheduleId = string;
export type HeatingScheduleSetpointMappingId = string;
export type HeatingModeId = string;

export type FeedbackMode = 0 | 1 | 2;
export type WeekdaySelection = 0 | 1 | 2;
export type HeatingType = 'radiator' | 'underfloorHeating';

/** 0 = on change, 1 = on update, 2 = cyclic. */
export const DEFAULT_FEEDBACK_MODE: FeedbackMode = 1;
/** 0 = all weekdays, 1 = include selected weekdays, 2 = exclude selected weekdays. */
export const DEFAULT_WEEKDAY_SELECTION: WeekdaySelection = 1;
/** The default heating system used for existing and newly created schedules. */
export const DEFAULT_HEATING_TYPE: HeatingType = 'radiator';
export const DEFAULT_DEVIATION_COUNT_BEFORE_WRITE = 3;
export const DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES = 5;
export const DEFAULT_HEATING_MODE_START_TIME = '00:00';
export const DEFAULT_HEATING_MODE_TEMPERATURE = 20;
export const DEFAULT_HEATING_MODE_PRIORITY = 0;
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

/**
 * Returns true when a heating-mode priority is a non-negative safe integer.
 *
 * @param value candidate priority
 */
export function isHeatingModePriority(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Returns true when the value is a supported heating system type.
 *
 * @param value candidate value to validate
 */
export function isHeatingType(value: unknown): value is HeatingType {
	return value === 'radiator' || value === 'underfloorHeating';
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
	/** Calendar date on which this mode is activated when it is inactive. */
	startDate?: string;
	/** Calendar date on which this mode is deactivated. */
	endDate?: string;
	/** Target temperature for this initial rule. */
	temperature: number;
	/** Higher values win when several currently applicable modes compete. */
	priority: number;
}

/** A schedule managed by the Heating Scheduler adapter. */
export interface HeatingSchedule {
	/** Stable technical identifier. */
	id: HeatingScheduleId;
	/** User-facing display name. */
	name: string;
	/** Heating system represented by this schedule. */
	heatingType: HeatingType;
	/** Calendar date on which this schedule is activated. */
	startDate?: string;
	/** Calendar date on which this schedule is deactivated. */
	endDate?: string;
	/** Independent Sollwert-/Ist-Sollwert relationships. */
	setpointMappings: HeatingScheduleSetpointMapping[];
	/** Heating modes configured below this schedule. */
	heatingModes: HeatingMode[];
	/** Next generated mapping number for this schedule. */
	nextSetpointMappingNumber: number;
	/** Next generated mode number for this schedule. */
	nextHeatingModeNumber: number;
}

function heatingModeMatchesWeekday(mode: HeatingMode, weekday: number): boolean {
	return mode.weekdaySelection === 0
		? true
		: mode.weekdaySelection === 1
			? mode.weekdays.includes(weekday)
			: !mode.weekdays.includes(weekday);
}

function heatingModeStartMinutes(mode: HeatingMode): number {
	const [hours, minutes] = mode.startTime.split(':').map(Number);
	return hours * 60 + minutes;
}

function heatingModePriority(mode: HeatingMode): number {
	return mode.priority;
}

/**
 * Selects the currently applicable recurring heating-mode rule for application.
 * Higher priorities win; equal priorities use the most recent rule and then the
 * later configured mode as a deterministic tie-breaker. Active states and date
 * boundaries are deliberately ignored by this pure selection helper.
 *
 * @param schedule schedule whose heating modes should be searched
 * @param weekday current weekday, Monday = 1 through Sunday = 7
 * @param minutesSinceMidnight current local time in minutes
 * @param includePreviousWeekdays whether to use the previous matching weekday as a fallback
 */
export function selectHeatingModeForManualActivation(
	schedule: Pick<HeatingSchedule, 'heatingModes'>,
	weekday: number,
	minutesSinceMidnight: number,
	includePreviousWeekdays = true,
): HeatingMode | undefined {
	if (
		!Number.isInteger(weekday) ||
		weekday < 1 ||
		weekday > 7 ||
		!Number.isInteger(minutesSinceMidnight) ||
		minutesSinceMidnight < 0 ||
		minutesSinceMidnight >= 24 * 60
	) {
		return undefined;
	}

	let selected: { mode: HeatingMode; elapsedMinutes: number; index: number } | undefined;
	for (let daysAgo = 0; daysAgo < (includePreviousWeekdays ? 7 : 1); daysAgo += 1) {
		const occurrenceWeekday = ((weekday - 1 - daysAgo + 7) % 7) + 1;
		for (const [index, mode] of schedule.heatingModes.entries()) {
			if (!heatingModeMatchesWeekday(mode, occurrenceWeekday)) {
				continue;
			}
			const startMinutes = heatingModeStartMinutes(mode);
			if (daysAgo === 0 && startMinutes > minutesSinceMidnight) {
				continue;
			}
			const elapsedMinutes = daysAgo * 24 * 60 + minutesSinceMidnight - startMinutes;
			if (
				!selected ||
				heatingModePriority(mode) > heatingModePriority(selected.mode) ||
				(heatingModePriority(mode) === heatingModePriority(selected.mode) &&
					(elapsedMinutes < selected.elapsedMinutes ||
						(elapsedMinutes === selected.elapsedMinutes && index > selected.index)))
			) {
				selected = { mode, elapsedMinutes, index };
			}
		}
	}
	return selected?.mode;
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

function nonNegativeInteger(value: unknown, fallback: number): number {
	const parsed = finiteNumber(value, fallback);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
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

function normalizeHeatingType(value: unknown): HeatingType {
	return isHeatingType(value) ? value : DEFAULT_HEATING_TYPE;
}

function normalizeDate(value: unknown): string | undefined {
	const date = asTrimmedString(value);
	if (!DATE_PATTERN.test(date)) {
		return undefined;
	}
	const parsed = new Date(`${date}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? undefined : date;
}

/**
 * Returns true when the value is a valid local calendar date in YYYY-MM-DD format.
 *
 * @param value candidate value to validate
 */
export function isValidCalendarDate(value: unknown): value is string {
	return normalizeDate(value) !== undefined;
}

/**
 * Returns true when the optional activation dates can be used together.
 *
 * Start and end dates are independent switching points. The start date
 * activates and the end date deactivates, so their chronological order is
 * intentionally not restricted.
 *
 * @param startDate optional activation start date
 * @param endDate optional activation end date
 */
export function isValidDateRange(startDate?: string, endDate?: string): boolean {
	return (!startDate || isValidCalendarDate(startDate)) && (!endDate || isValidCalendarDate(endDate));
}

/**
 * Returns the activation state after applying the configured date switches.
 *
 * If both dates are in the past, the later switch wins. This also makes a
 * start date after the end date useful: the end date can switch a mode off
 * first and the later start date can switch it on again.
 *
 * @param date date to test
 * @param startDate optional activation start date
 * @param endDate optional activation end date
 * @param defaultEnabled state before any configured switch
 */
export function isDateInActivationRange(
	date: string,
	startDate?: string,
	endDate?: string,
	defaultEnabled = true,
): boolean {
	let enabled = startDate ? false : endDate ? true : defaultEnabled;
	const startReached = !!startDate && startDate <= date;
	const endReached = !!endDate && endDate <= date;
	if (startReached && endReached) {
		enabled = startDate > endDate;
	} else if (startReached) {
		enabled = true;
	} else if (endReached) {
		enabled = false;
	}
	return enabled;
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
			...(normalizeDate(candidate.endDate) ? { endDate: normalizeDate(candidate.endDate) } : {}),
			temperature: finiteNumber(candidate.temperature, DEFAULT_HEATING_MODE_TEMPERATURE),
			priority: nonNegativeInteger(candidate.priority, DEFAULT_HEATING_MODE_PRIORITY),
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
		heatingType: normalizeHeatingType(value.heatingType),
		...(normalizeDate(value.startDate) ? { startDate: normalizeDate(value.startDate) } : {}),
		...(normalizeDate(value.endDate) ? { endDate: normalizeDate(value.endDate) } : {}),
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
			if (schedule.heatingType !== undefined && !isHeatingType(schedule.heatingType)) {
				errors.push(`schedules[${index}].heatingType is invalid.`);
			}
			if (schedule.startDate !== undefined && !isValidCalendarDate(schedule.startDate)) {
				errors.push(`schedules[${index}].startDate is invalid.`);
			}
			if (schedule.endDate !== undefined && !isValidCalendarDate(schedule.endDate)) {
				errors.push(`schedules[${index}].endDate is invalid.`);
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
					if (isRecord(mode)) {
						if (mode.priority !== undefined && !isHeatingModePriority(mode.priority)) {
							errors.push(`schedules[${index}].heatingModes[${modeIndex}].priority is invalid.`);
						}
						if (mode.startDate !== undefined && !isValidCalendarDate(mode.startDate)) {
							errors.push(`schedules[${index}].heatingModes[${modeIndex}].startDate is invalid.`);
						}
						if (mode.endDate !== undefined && !isValidCalendarDate(mode.endDate)) {
							errors.push(`schedules[${index}].heatingModes[${modeIndex}].endDate is invalid.`);
						}
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
 * Returns the smallest free technical schedule ID and the following counter.
 *
 * @param _nextScheduleNumber legacy counter retained in the persisted configuration
 * @param usedIds technical schedule IDs that are already in use
 */
export function createScheduleId(
	_nextScheduleNumber: number,
	usedIds: ReadonlySet<string>,
): { id: HeatingScheduleId; nextScheduleNumber: number } {
	let number = 1;
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
