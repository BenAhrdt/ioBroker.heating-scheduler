/*
 * Heating Scheduler adapter configuration/runtime bridge.
 *
 * Schedule evaluation, target-state writes, and the runtime state bridge live
 * in this adapter entry point.
 */
import * as utils from '@iobroker/adapter-core';
import {
	DEFAULT_HEATING_TYPE,
	isFeedbackMode,
	isDateInActivationRange,
	isEmptyConfiguration,
	isWeekdaySelection,
	isValidCalendarDate,
	normalizeConfiguration,
	selectHeatingModeForManualActivation,
	type FeedbackMode,
	type HeatingType,
	type HeatingSchedulesConfiguration,
	type HeatingSchedule,
	type WeekdaySelection,
} from './lib/configuration';
import { configurationBackupNeedsUpdate, getRestorableConfigurationBackup } from './lib/configuration-backup';
import { HeatingSchedulerManagement } from './lib/schedule-management';
import {
	addScheduleToConfiguration,
	removeScheduleFromConfiguration,
	renameScheduleInConfiguration,
	updateScheduleConfiguration,
	type HeatingScheduleConfigurationPatch,
} from './lib/schedule-operations';

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type WeekdayName = (typeof WEEKDAY_NAMES)[number];
const FEEDBACK_MODE_STATES: Record<FeedbackMode, string> = {
	0: 'On change',
	1: 'On update',
	2: 'Cyclic',
};
const WEEKDAY_SELECTION_STATES: Record<WeekdaySelection, string> = {
	0: 'All weekdays',
	1: 'Include selected days',
	2: 'Exclude selected days',
};

class HeatingScheduler extends utils.Adapter {
	private configuration: HeatingSchedulesConfiguration = normalizeConfiguration(undefined);
	private scheduleManagement?: HeatingSchedulerManagement;
	private configurationBackupTimer: ioBroker.Timeout | undefined;
	private scheduleTimer: ioBroker.Interval | undefined;
	private feedbackPollTimer: ioBroker.Interval | undefined;
	private readonly feedbackTimers = new Map<string, ioBroker.Interval>();
	private readonly monitoredStateSubscriptions = new Set<string>();
	private readonly feedbackDeviationCounts = new Map<string, number>();
	private readonly lastFeedbackValues = new Map<string, number>();
	private readonly lastFeedbackUpdateTokens = new Map<string, string>();
	private readonly lastScheduleExecutions = new Map<string, string>();
	private readonly processedActivationTransitions = new Set<string>();
	private configurationQueue: Promise<void> = Promise.resolve();
	private readonly pendingOperations = new Set<Promise<void>>();
	private unloading = false;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'heating-scheduler',
		});
		this.on('ready', () => this.trackEventOperation('startup', () => this.onReady()));
		this.on('stateChange', (id, state) =>
			this.trackEventOperation(`state change for ${id}`, () => this.onStateChange(id, state)),
		);
		this.on('message', message =>
			this.trackEventOperation(`message ${message.command}`, () => this.onMessage(message)),
		);
		this.on('unload', callback => this.onUnload(callback));
	}

	/** Initializes the persisted configuration and the neutral Device Manager. */
	private async onReady(): Promise<void> {
		if (this.unloading) {
			return;
		}

		await this.setState('info.connection', false, true);
		this.scheduleManagement = new HeatingSchedulerManagement(this);
		await this.ensureInfoObjects();

		const schedulesFolder = await this.getObjectAsync('schedules');
		this.configuration = normalizeConfiguration(schedulesFolder?.native);
		if (isEmptyConfiguration(this.configuration)) {
			const restored = await this.restoreScheduleConfigurationBackup(false);
			if (restored) {
				this.log.info('Restored the schedule configuration from the instance backup');
			}
		}

		await this.persistConfiguration(undefined);
		this.subscribeStates('schedules.*');
		this.startScheduleTimer();
		await this.setState('info.connection', true, true);
		this.scheduleConfigurationBackup();
	}

	private async ensureInfoObjects(): Promise<void> {
		await this.setObjectNotExistsAsync('info.deviceManager', {
			type: 'state',
			common: {
				name: {
					en: 'Device Manager communication',
					de: 'Device-Manager-Kommunikation',
				},
				type: 'string',
				role: 'indicator',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});
	}

	public getHeatingSchedules(): readonly HeatingSchedule[] {
		return this.configuration.schedules.map(schedule => ({ ...schedule }));
	}

	public async getNumericStateNames(): Promise<Readonly<Record<string, string>>> {
		const objects = await this.getForeignObjectsAsync('*', 'state');
		return Object.fromEntries(
			Object.entries(objects)
				.filter(([, object]) => object.common?.type === 'number')
				.map(([id, object]) => {
					const name = object.common?.name;
					const localizedName =
						name && typeof name === 'object'
							? (name as Record<string, unknown>).de || (name as Record<string, unknown>).en
							: undefined;
					const displayName =
						typeof name === 'string' ? name : typeof localizedName === 'string' ? localizedName : id;
					return [id, displayName] as const;
				}),
		);
	}

	public async addHeatingSchedule(name: string, heatingType: HeatingType = DEFAULT_HEATING_TYPE): Promise<string> {
		return this.enqueueConfigurationMutation(current => {
			const changed = addScheduleToConfiguration(current, name, heatingType);
			return {
				result: changed.id,
				configuration: changed.configuration,
			};
		});
	}

	public async renameHeatingSchedule(id: string, name: string, heatingType?: HeatingType): Promise<void> {
		return this.enqueueConfigurationMutation(current => {
			return {
				result: undefined,
				configuration: renameScheduleInConfiguration(current, id, name, heatingType),
			};
		});
	}

	public async removeHeatingSchedule(id: string): Promise<void> {
		return this.enqueueConfigurationMutation(current => {
			return {
				result: undefined,
				configuration: removeScheduleFromConfiguration(current, id),
			};
		});
	}

	public async updateHeatingSchedule(id: string, patch: HeatingScheduleConfigurationPatch): Promise<void> {
		const validNumericStateIds = new Set(Object.keys(await this.getNumericStateNames()));
		return this.enqueueConfigurationMutation(
			current => ({
				result: undefined,
				configuration: updateScheduleConfiguration(current, id, patch, validNumericStateIds),
			}),
			id,
		);
	}

	private enqueueConfigurationMutation<T>(
		mutation: (current: HeatingSchedulesConfiguration) => {
			configuration: HeatingSchedulesConfiguration;
			result: T;
		},
		activationScheduleId?: string,
	): Promise<T> {
		let result!: T;
		const operation = this.configurationQueue.then(async () => {
			const changed = mutation(this.configuration);
			result = changed.result;
			await this.persistConfiguration(changed.configuration, activationScheduleId);
		});
		this.configurationQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		this.pendingOperations.add(operation);
		void operation.then(
			() => this.pendingOperations.delete(operation),
			() => this.pendingOperations.delete(operation),
		);
		return operation.then(() => result);
	}

	private async persistConfiguration(
		next: HeatingSchedulesConfiguration | undefined,
		activationScheduleId?: string,
	): Promise<void> {
		const previous = this.configuration;
		if (next) {
			this.configuration = normalizeConfiguration(next);
		}
		await this.setObjectAsync('schedules', {
			type: 'folder',
			common: {
				name: {
					en: 'Schedules',
					de: 'Heizpläne',
				},
			},
			native: structuredClone(this.configuration),
		});
		await this.synchronizeScheduleObjects(previous, this.configuration);
		this.scheduleManagement?.refreshDeviceCache();
		if (next && activationScheduleId) {
			await this.applyInitialActivationStates(previous, activationScheduleId);
		}
		await this.synchronizeFeedbackMonitoring(previous, this.configuration);
		if (next) {
			this.scheduleConfigurationBackup();
		}
	}

	private async synchronizeFeedbackMonitoring(
		_previous: HeatingSchedulesConfiguration,
		next: HeatingSchedulesConfiguration,
	): Promise<void> {
		const nextMappings = next.schedules.flatMap(schedule =>
			schedule.setpointMappings
				.filter(mapping => !!mapping.feedbackStateId)
				.map(mapping => ({ scheduleId: schedule.id, mapping })),
		);
		const nextMonitoredStates = new Set(
			nextMappings.flatMap(entry => [entry.mapping.setpointStateId, entry.mapping.feedbackStateId as string]),
		);
		for (const stateId of this.monitoredStateSubscriptions) {
			if (!nextMonitoredStates.has(stateId)) {
				this.unsubscribeForeignStates(stateId);
				this.monitoredStateSubscriptions.delete(stateId);
			}
		}
		for (const stateId of nextMonitoredStates) {
			if (!this.monitoredStateSubscriptions.has(stateId)) {
				this.subscribeForeignStates(stateId);
				this.monitoredStateSubscriptions.add(stateId);
			}
		}
		for (const entry of nextMappings) {
			const state = await this.getForeignStateAsync(entry.mapping.feedbackStateId as string);
			const currentValue = this.asNumericStateValue(state?.val);
			if (state && currentValue !== undefined) {
				this.lastFeedbackValues.set(entry.mapping.feedbackStateId as string, currentValue);
				this.lastFeedbackUpdateTokens.set(
					this.feedbackKey(entry.scheduleId, entry.mapping.id),
					this.feedbackUpdateToken(state),
				);
			}
		}
		if (nextMappings.length && !this.feedbackPollTimer) {
			this.feedbackPollTimer = this.setInterval(
				() => this.trackEventOperation('feedback state polling', () => this.pollFeedbackStates()),
				1_000,
			);
		}
		if (!nextMappings.length && this.feedbackPollTimer) {
			this.clearInterval(this.feedbackPollTimer);
			this.feedbackPollTimer = undefined;
		}
		for (const timer of this.feedbackTimers.values()) {
			this.clearInterval(timer);
		}
		this.feedbackTimers.clear();
		const validKeys = new Set<string>();
		for (const entry of nextMappings) {
			const key = this.feedbackKey(entry.scheduleId, entry.mapping.id);
			validKeys.add(key);
			if (entry.mapping.feedbackMode !== 2) {
				continue;
			}
			const intervalMinutes = Math.max(1, entry.mapping.feedbackIntervalMinutes || 1);
			const timer = this.setInterval(
				() =>
					this.trackEventOperation(`cyclic feedback ${key}`, () =>
						this.checkCyclicFeedback(entry.scheduleId, entry.mapping.id),
					),
				intervalMinutes * 60_000,
			);
			if (timer) {
				this.feedbackTimers.set(key, timer);
			}
		}
		for (const key of this.feedbackDeviationCounts.keys()) {
			if (!validKeys.has(key)) {
				this.feedbackDeviationCounts.delete(key);
			}
		}
		for (const key of this.lastFeedbackUpdateTokens.keys()) {
			if (!validKeys.has(key)) {
				this.lastFeedbackUpdateTokens.delete(key);
			}
		}
	}

	private startScheduleTimer(): void {
		if (this.scheduleTimer) {
			this.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = this.setInterval(
			() => this.trackEventOperation('schedule evaluation', () => this.evaluateSchedules()),
			30_000,
		);
		this.trackEventOperation('initial schedule evaluation', () => this.evaluateSchedules());
	}

	private localDate(): string {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	}

	private async applyInitialActivationStates(
		previous: HeatingSchedulesConfiguration,
		scheduleId: string,
	): Promise<void> {
		const date = this.localDate();
		for (const schedule of this.configuration.schedules) {
			if (schedule.id !== scheduleId) {
				continue;
			}
			const previousSchedule = previous.schedules.find(candidate => candidate.id === schedule.id);
			const scheduleDatesChanged =
				!previousSchedule ||
				previousSchedule.startDate !== schedule.startDate ||
				previousSchedule.endDate !== schedule.endDate;
			if (scheduleDatesChanged) {
				const scheduleEnabled =
					schedule.startDate || schedule.endDate
						? isDateInActivationRange(date, schedule.startDate, schedule.endDate, true)
						: true;
				await this.setStateChangedAsync(`schedules.${schedule.id}.enabled`, {
					val: scheduleEnabled,
					ack: true,
				});
			}
			for (const mode of schedule.heatingModes) {
				const previousMode = previousSchedule?.heatingModes.find(candidate => candidate.id === mode.id);
				const modeDatesChanged =
					!previousMode || previousMode.startDate !== mode.startDate || previousMode.endDate !== mode.endDate;
				if (modeDatesChanged) {
					const modeEnabled =
						mode.startDate || mode.endDate
							? isDateInActivationRange(date, mode.startDate, mode.endDate, false)
							: false;
					await this.setStateChangedAsync(`schedules.${schedule.id}.heatingModes.${mode.id}.enabled`, {
						val: modeEnabled,
						ack: true,
					});
				}
			}
		}
	}

	private async applyDateActivationTransition(
		stateId: string,
		startDate: string | undefined,
		endDate: string | undefined,
		date: string,
	): Promise<void> {
		let currentValue = (await this.getStateAsync(stateId))?.val;
		if (startDate === date) {
			const key = `${stateId}:start:${startDate}`;
			if (!this.processedActivationTransitions.has(key)) {
				this.processedActivationTransitions.add(key);
				if (currentValue !== true) {
					await this.setStateChangedAsync(stateId, { val: true, ack: true });
					currentValue = true;
				}
			}
		}
		if (endDate === date) {
			const key = `${stateId}:end:${endDate}`;
			if (!this.processedActivationTransitions.has(key)) {
				this.processedActivationTransitions.add(key);
				if (currentValue === true) {
					await this.setStateChangedAsync(stateId, { val: false, ack: true });
					currentValue = false;
				}
			}
		}
	}

	private async applyDateActivationTransitions(date: string): Promise<void> {
		for (const schedule of this.configuration.schedules) {
			await this.applyDateActivationTransition(
				`schedules.${schedule.id}.enabled`,
				schedule.startDate,
				schedule.endDate,
				date,
			);
			for (const mode of schedule.heatingModes) {
				await this.applyDateActivationTransition(
					`schedules.${schedule.id}.heatingModes.${mode.id}.enabled`,
					mode.startDate,
					mode.endDate,
					date,
				);
			}
		}
	}

	private async synchronizeScheduleObjects(
		previous: HeatingSchedulesConfiguration,
		next: HeatingSchedulesConfiguration,
	): Promise<void> {
		const nextIds = new Set(next.schedules.map(schedule => schedule.id));
		for (const schedule of previous.schedules) {
			if (!nextIds.has(schedule.id)) {
				await this.delObjectAsync(`schedules.${schedule.id}`, { recursive: true });
			}
		}
		for (const schedule of next.schedules) {
			const date = this.localDate();
			await this.setObjectAsync(`schedules.${schedule.id}`, {
				// ioBroker has no schedule object type; Device Manager schedules are
				// represented as valid device objects below the schedules folder.
				type: 'device',
				common: { name: schedule.name },
				native: {},
			});
			// The schedule name is already represented by the schedule object's common.name.
			// Remove the legacy duplicate state from installations created by older versions.
			await this.delObjectAsync(`schedules.${schedule.id}.name`);
			await this.ensureRuntimeState(
				`schedules.${schedule.id}.enabled`,
				{
					name: { en: 'Heating schedule enabled', de: 'Heizplan aktiviert' },
					type: 'boolean',
					role: 'switch',
					read: true,
					write: true,
				},
				schedule.startDate || schedule.endDate
					? isDateInActivationRange(date, schedule.startDate, schedule.endDate, true)
					: true,
				`schedules.${schedule.id}.active`,
			);
			await this.ensureRuntimeState(
				`schedules.${schedule.id}.applyMatching`,
				{
					name: { en: 'Apply matching setpoint', de: 'Passenden Sollwert anwenden' },
					type: 'boolean',
					role: 'button',
					read: false,
					write: true,
				},
				false,
				`schedules.${schedule.id}.activate`,
				false,
			);
			await this.ensureRuntimeState(
				`schedules.${schedule.id}.applyEnabledMatching`,
				{
					name: { en: 'Apply enabled matching setpoint', de: 'Passenden aktivierten Sollwert anwenden' },
					type: 'boolean',
					role: 'button',
					read: false,
					write: true,
				},
				false,
				`schedules.${schedule.id}.activateActive`,
				false,
			);
			await this.ensureRuntimeState(
				`schedules.${schedule.id}.applyEnabledModeMatching`,
				{
					name: { en: 'Apply enabled-mode matching setpoint', de: 'Sollwert des aktivierten Modus anwenden' },
					type: 'boolean',
					role: 'button',
					read: false,
					write: true,
				},
				false,
			);
			await this.ensureConfigurationState(
				`schedules.${schedule.id}.startDate`,
				{
					name: { en: 'Activate from (optional)', de: 'Aktivieren ab (optional)' },
					type: 'string',
					role: 'date.start',
					read: true,
					write: true,
				},
				schedule.startDate ?? '',
			);
			await this.ensureConfigurationState(
				`schedules.${schedule.id}.endDate`,
				{
					name: { en: 'Deactivate from (optional)', de: 'Deaktivieren ab (optional)' },
					type: 'string',
					role: 'date.end',
					read: true,
					write: true,
				},
				schedule.endDate ?? '',
			);
			const previousSchedule = previous.schedules.find(candidate => candidate.id === schedule.id);
			await this.synchronizeSetpointMappingObjects(schedule, previousSchedule);
			await this.synchronizeHeatingModeObjects(schedule, previousSchedule);
		}
	}

	private async synchronizeSetpointMappingObjects(
		schedule: HeatingSchedule,
		previousSchedule: HeatingSchedule | undefined,
	): Promise<void> {
		const base = `schedules.${schedule.id}.setpointMappings`;
		if (!schedule.setpointMappings.length) {
			if (previousSchedule?.setpointMappings.length) {
				await this.delObjectAsync(base, { recursive: true });
			}
			return;
		}
		const nextIds = new Set(schedule.setpointMappings.map(mapping => mapping.id));
		for (const mapping of previousSchedule?.setpointMappings || []) {
			if (!nextIds.has(mapping.id)) {
				await this.delObjectAsync(`${base}.${mapping.id}`, { recursive: true });
			}
		}
		await this.setObjectAsync(base, {
			type: 'channel',
			common: { name: { en: 'Setpoint mappings', de: 'Sollwert-Zuordnungen' } },
			native: {},
		});
		for (const mapping of schedule.setpointMappings) {
			const mappingBase = `${base}.${mapping.id}`;
			await this.setObjectAsync(mappingBase, {
				type: 'channel',
				common: { name: mapping.setpointStateId },
				native: {},
			});
			await this.ensureConfigurationState(
				`${mappingBase}.setpointStateId`,
				{
					name: { en: 'Setpoint state ID', de: 'Sollwert-State-ID' },
					type: 'string',
					role: 'text',
					read: true,
					write: true,
				},
				mapping.setpointStateId,
			);
			if (mapping.feedbackStateId) {
				await this.ensureConfigurationState(
					`${mappingBase}.feedbackStateId`,
					{
						name: { en: 'Feedback state ID', de: 'Rückmelde-State-ID' },
						type: 'string',
						role: 'text',
						read: true,
						write: true,
					},
					mapping.feedbackStateId,
				);
			} else if (previousSchedule?.setpointMappings.find(entry => entry.id === mapping.id)?.feedbackStateId) {
				await this.delObjectAsync(`${mappingBase}.feedbackStateId`);
			}
			await this.ensureConfigurationState(
				`${mappingBase}.feedbackMode`,
				{
					name: { en: 'Feedback mode', de: 'Rückmeldeart' },
					type: 'number',
					role: 'value',
					states: FEEDBACK_MODE_STATES,
					min: 0,
					max: 2,
					step: 1,
					read: true,
					write: true,
				},
				mapping.feedbackMode,
			);
			await this.ensureConfigurationState(
				`${mappingBase}.feedbackIntervalMinutes`,
				{
					name: { en: 'Feedback interval in minutes', de: 'Rückmeldeintervall in Minuten' },
					type: 'number',
					role: 'time.interval',
					unit: 'min',
					min: 0,
					read: true,
					write: true,
				},
				mapping.feedbackIntervalMinutes ?? 0,
			);
			await this.ensureConfigurationState(
				`${mappingBase}.deviationCountBeforeWrite`,
				{
					name: { en: 'Deviations before write', de: 'Abweichungen bis zum erneuten Schreiben' },
					type: 'number',
					role: 'level',
					min: 1,
					read: true,
					write: true,
				},
				mapping.deviationCountBeforeWrite,
			);
		}
	}

	private async synchronizeHeatingModeObjects(
		schedule: HeatingSchedule,
		previousSchedule: HeatingSchedule | undefined,
	): Promise<void> {
		const base = `schedules.${schedule.id}.heatingModes`;
		if (!schedule.heatingModes.length) {
			if (previousSchedule?.heatingModes.length) {
				await this.delObjectAsync(base, { recursive: true });
			}
			return;
		}
		const nextIds = new Set(schedule.heatingModes.map(mode => mode.id));
		for (const mode of previousSchedule?.heatingModes || []) {
			if (!nextIds.has(mode.id)) {
				await this.delObjectAsync(`${base}.${mode.id}`, { recursive: true });
			}
		}
		await this.setObjectAsync(base, {
			type: 'channel',
			common: { name: { en: 'Heating modes', de: 'Heizmodi' } },
			native: {},
		});
		for (const mode of schedule.heatingModes) {
			const modeBase = `${base}.${mode.id}`;
			await this.setObjectAsync(modeBase, {
				type: 'channel',
				common: { name: mode.name },
				native: {},
			});
			// The heating-mode name is already represented by the channel's common.name.
			// Remove the legacy duplicate state from installations created by older versions.
			await this.delObjectAsync(`${modeBase}.name`);
			await this.setObjectAsync(`${modeBase}.weekdays`, {
				type: 'channel',
				common: { name: { en: 'Weekdays', de: 'Wochentage' } },
				native: {},
			});
			for (let day = 1; day <= 7; day += 1) {
				const weekday = WEEKDAY_NAMES[day - 1];
				await this.ensureConfigurationState(
					`${modeBase}.weekdays.${weekday}`,
					{
						name: { en: weekday, de: this.getGermanWeekdayName(weekday) },
						type: 'boolean',
						role: 'switch',
						read: true,
						write: true,
					},
					mode.weekdays.includes(day),
				);
			}
			await this.ensureConfigurationState(
				`${modeBase}.weekdaySelection`,
				{
					name: { en: 'Weekday selection', de: 'Wochentagauswahl' },
					type: 'number',
					role: 'value',
					states: WEEKDAY_SELECTION_STATES,
					min: 0,
					max: 2,
					step: 1,
					read: true,
					write: true,
				},
				mode.weekdaySelection,
			);
			await this.ensureConfigurationState(
				`${modeBase}.startDate`,
				{
					name: { en: 'Activate from (optional)', de: 'Aktivieren ab (optional)' },
					type: 'string',
					role: 'date.start',
					read: true,
					write: true,
				},
				mode.startDate ?? '',
			);
			await this.ensureConfigurationState(
				`${modeBase}.endDate`,
				{
					name: { en: 'Deactivate from (optional)', de: 'Deaktivieren ab (optional)' },
					type: 'string',
					role: 'date.end',
					read: true,
					write: true,
				},
				mode.endDate ?? '',
			);
			await this.ensureConfigurationState(
				`${modeBase}.startTime`,
				{
					name: { en: 'Time', de: 'Zeit' },
					type: 'string',
					role: 'text',
					read: true,
					write: true,
				},
				mode.startTime,
			);
			await this.ensureConfigurationState(
				`${modeBase}.temperature`,
				{
					name: { en: 'Temperature', de: 'Temperatur' },
					type: 'number',
					role: 'level.temperature',
					unit: '°C',
					read: true,
					write: true,
				},
				mode.temperature,
			);
			await this.ensureRuntimeState(
				`${modeBase}.enabled`,
				{
					name: { en: 'Enabled', de: 'Aktiviert' },
					type: 'boolean',
					role: 'switch',
					read: true,
					write: true,
				},
				mode.startDate || mode.endDate
					? isDateInActivationRange(this.localDate(), mode.startDate, mode.endDate, false)
					: false,
				`${modeBase}.active`,
			);
			await this.ensureRuntimeState(
				`${modeBase}.applyNow`,
				{
					name: { en: 'Apply now', de: 'Jetzt anwenden' },
					type: 'boolean',
					role: 'button',
					read: false,
					write: true,
				},
				false,
				`${modeBase}.activate`,
				false,
			);
		}
	}

	private getGermanWeekdayName(weekday: WeekdayName): string {
		return {
			monday: 'Montag',
			tuesday: 'Dienstag',
			wednesday: 'Mittwoch',
			thursday: 'Donnerstag',
			friday: 'Freitag',
			saturday: 'Samstag',
			sunday: 'Sonntag',
		}[weekday];
	}

	private async ensureConfigurationState(id: string, common: any, value: unknown): Promise<void> {
		await this.setObjectAsync(id, { type: 'state', common, native: {} });
		await this.setStateChangedAsync(id, { val: value as ioBroker.StateValue, ack: true });
	}

	private async ensureRuntimeState(
		id: string,
		common: any,
		defaultValue: boolean,
		legacyId?: string,
		migrateLegacyValue = true,
	): Promise<void> {
		const currentState = await this.getStateAsync(id);
		const legacyState = legacyId ? await this.getStateAsync(legacyId) : undefined;
		await this.setObjectAsync(id, { type: 'state', common, native: {} });
		if (!currentState) {
			const legacyValue =
				migrateLegacyValue && typeof legacyState?.val === 'boolean' ? legacyState.val : undefined;
			await this.setStateChangedAsync(id, { val: legacyValue ?? defaultValue, ack: true });
		}
		if (legacyId) {
			await this.delObjectAsync(legacyId);
		}
	}

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (this.unloading || !state) {
			return;
		}
		this.resetFeedbackDeviationForSetpoint(id);
		try {
			await this.handleFeedbackStateChange(id, state);
		} catch (error) {
			this.log.error(`Feedback evaluation for ${id} failed: ${String(error)}`);
		}
		if (state.ack !== false) {
			return;
		}
		const relativeId = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
		const parts = relativeId.split('.');
		if (parts[0] !== 'schedules') {
			return;
		}
		try {
			const scheduleId = parts[1];
			if (parts.length === 3) {
				if (parts[2] === 'enabled') {
					if (typeof state.val !== 'boolean') {
						throw new Error('The schedule enabled state must be boolean');
					}
					await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
					return;
				}
				if (parts[2] === 'applyMatching') {
					if (state.val === true) {
						await this.executeCurrentHeatingMode(scheduleId);
					}
					await this.setStateChangedAsync(relativeId, { val: false, ack: true });
					return;
				}
				if (parts[2] === 'applyEnabledMatching') {
					try {
						if (state.val === true) {
							await this.executeEnabledModeMatchingHeatingMode(scheduleId, true);
						}
					} finally {
						await this.setStateChangedAsync(relativeId, { val: false, ack: true });
					}
					return;
				}
				if (parts[2] === 'applyEnabledModeMatching') {
					try {
						if (state.val === true) {
							await this.executeEnabledModeMatchingHeatingMode(scheduleId, false);
						}
					} finally {
						await this.setStateChangedAsync(relativeId, { val: false, ack: true });
					}
					return;
				}
				if (parts[2] === 'startDate' || parts[2] === 'endDate') {
					const date = typeof state.val === 'string' ? state.val.trim() : '';
					if (date && !isValidCalendarDate(date)) {
						throw new Error(`${parts[2]} must use YYYY-MM-DD`);
					}
					const schedule = this.configuration.schedules.find(candidate => candidate.id === scheduleId);
					if (!schedule) {
						throw new Error(`Schedule ${scheduleId} does not exist`);
					}
					await this.updateConfigurationFromState(scheduleId, current => {
						if (date) {
							current[parts[2] as 'startDate' | 'endDate'] = date;
						} else {
							delete current[parts[2] as 'startDate' | 'endDate'];
						}
					});
					return;
				}
			}
			if (parts.length < 5) {
				return;
			}
			if (parts[2] === 'setpointMappings') {
				const mappingId = parts[3];
				const field = parts[4];
				const mapping = this.configuration.schedules
					.find(schedule => schedule.id === scheduleId)
					?.setpointMappings.find(candidate => candidate.id === mappingId);
				if (!mapping) {
					throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
				}
				if (field === 'setpointStateId' || field === 'feedbackStateId') {
					const stateId = typeof state.val === 'string' ? state.val.trim() : '';
					if (field === 'setpointStateId' && !stateId) {
						throw new Error('The Sollwert state ID must not be empty');
					}
					if (stateId) {
						const object = await this.getForeignObjectAsync(stateId);
						if (object?.type !== 'state' || object.common?.type !== 'number') {
							throw new Error(`${field} must reference an existing number state`);
						}
					}
					await this.updateConfigurationFromState(scheduleId, schedule => {
						const target = schedule.setpointMappings.find(candidate => candidate.id === mappingId);
						if (!target) {
							throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
						}
						if (field === 'setpointStateId') {
							target.setpointStateId = stateId;
						} else if (stateId) {
							target.feedbackStateId = stateId;
						} else {
							delete target.feedbackStateId;
						}
					});
					return;
				}
				await this.updateConfigurationFromState(scheduleId, schedule => {
					const target = schedule.setpointMappings.find(candidate => candidate.id === mappingId);
					if (!target) {
						throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
					}
					if (field === 'feedbackMode') {
						if (!isFeedbackMode(state.val)) {
							throw new Error('Feedback mode must be 0, 1, or 2');
						}
						target.feedbackMode = state.val;
						return;
					}
					if (field === 'feedbackIntervalMinutes') {
						const value = this.getPositiveNumber(state.val);
						target.feedbackIntervalMinutes = value;
						return;
					}
					if (field === 'deviationCountBeforeWrite') {
						const value = this.getPositiveInteger(state.val);
						target.deviationCountBeforeWrite = value;
						return;
					}
					throw new Error(`Unknown setpoint mapping state ${field}`);
				});
				return;
			}

			if (parts[2] !== 'heatingModes') {
				return;
			}
			const modeId = parts[3];
			const field = parts[4];
			const mode = this.configuration.schedules
				.find(schedule => schedule.id === scheduleId)
				?.heatingModes.find(candidate => candidate.id === modeId);
			if (!mode) {
				throw new Error(`Heating mode ${modeId} does not exist on schedule ${scheduleId}`);
			}
			if (field === 'enabled' && parts.length === 5) {
				if (typeof state.val !== 'boolean') {
					throw new Error('The heating-mode enabled state must be boolean');
				}
				await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
				return;
			}
			if (field === 'applyNow' && parts.length === 5) {
				if (state.val === true) {
					await this.executeHeatingMode(scheduleId, modeId);
				}
				await this.setStateChangedAsync(relativeId, { val: false, ack: true });
				return;
			}
			await this.updateConfigurationFromState(scheduleId, schedule => {
				const target = schedule.heatingModes.find(candidate => candidate.id === modeId);
				if (!target) {
					throw new Error(`Heating mode ${modeId} does not exist on schedule ${scheduleId}`);
				}
				if (field === 'weekdaySelection') {
					if (!isWeekdaySelection(state.val)) {
						throw new Error('Weekday selection must be 0, 1, or 2');
					}
					target.weekdaySelection = state.val;
					return;
				}
				if (field === 'startTime') {
					if (typeof state.val !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(state.val)) {
						throw new Error('Start time must use HH:mm');
					}
					target.startTime = state.val;
					return;
				}
				if (field === 'startDate') {
					if (typeof state.val !== 'string' || (state.val !== '' && !isValidCalendarDate(state.val))) {
						throw new Error('Start date must use YYYY-MM-DD');
					}
					if (state.val === '') {
						delete target.startDate;
					} else {
						target.startDate = state.val;
					}
					return;
				}
				if (field === 'endDate') {
					if (typeof state.val !== 'string' || (state.val !== '' && !isValidCalendarDate(state.val))) {
						throw new Error('End date must use YYYY-MM-DD');
					}
					if (state.val === '') {
						delete target.endDate;
					} else {
						target.endDate = state.val;
					}
					return;
				}
				if (field === 'temperature') {
					const value = this.getFiniteNumber(state.val);
					if (value < 0 || value > 50 || Math.round(value * 10) !== value * 10) {
						throw new Error('Temperature must be between 0 and 50 °C in 0.1 °C steps');
					}
					target.temperature = value;
					return;
				}
				if (field === 'weekdays' && parts.length === 6) {
					const weekday = WEEKDAY_NAMES.indexOf(parts[5] as WeekdayName) + 1;
					if (weekday < 1 || typeof state.val !== 'boolean') {
						throw new Error(`Unknown weekday state ${parts[5]}`);
					}
					target.weekdays = target.weekdays.filter(day => day !== weekday);
					if (state.val) {
						target.weekdays.push(weekday);
						target.weekdays.sort((left, right) => left - right);
					}
					if (!target.weekdays.length) {
						throw new Error('At least one weekday must remain selected');
					}
					return;
				}
				throw new Error(`Unknown heating-mode state ${field}`);
			});
		} catch (error) {
			this.log.warn(`Rejected state change for ${relativeId}: ${String(error)}`);
			await this.acknowledgeConfigurationState(relativeId, state.val);
		}
	}

	private resetFeedbackDeviationForSetpoint(stateId: string): void {
		for (const schedule of this.configuration.schedules) {
			for (const mapping of schedule.setpointMappings) {
				if (mapping.setpointStateId === stateId) {
					this.feedbackDeviationCounts.delete(this.feedbackKey(schedule.id, mapping.id));
				}
			}
		}
	}

	private async updateConfigurationFromState(
		scheduleId: string,
		update: (schedule: HeatingSchedule) => void,
	): Promise<void> {
		await this.enqueueConfigurationMutation(current => {
			const schedule = current.schedules.find(candidate => candidate.id === scheduleId);
			if (!schedule) {
				throw new Error(`Schedule ${scheduleId} does not exist`);
			}
			const changedSchedule = structuredClone(schedule);
			update(changedSchedule);
			return {
				result: undefined,
				configuration: normalizeConfiguration({
					...current,
					schedules: current.schedules.map(candidate =>
						candidate.id === scheduleId ? changedSchedule : candidate,
					),
				}),
			};
		});
	}

	private async acknowledgeConfigurationState(relativeId: string, fallback: ioBroker.StateValue): Promise<void> {
		const authoritative = this.getConfigurationStateValue(relativeId);
		await this.setStateChangedAsync(relativeId, {
			val: authoritative === undefined ? fallback : authoritative,
			ack: true,
		});
	}

	private getConfigurationStateValue(relativeId: string): ioBroker.StateValue | undefined {
		const parts = relativeId.split('.');
		if (parts[0] !== 'schedules') {
			return undefined;
		}
		const schedule = this.configuration.schedules.find(candidate => candidate.id === parts[1]);
		if (!schedule) {
			return undefined;
		}
		if (parts.length === 3) {
			switch (parts[2]) {
				case 'startDate':
					return schedule.startDate || '';
				case 'endDate':
					return schedule.endDate || '';
				case 'enabled':
					return undefined;
				default:
					return undefined;
			}
		}
		if (parts[2] === 'setpointMappings' && parts.length === 5) {
			const mapping = schedule.setpointMappings.find(candidate => candidate.id === parts[3]);
			if (!mapping) {
				return undefined;
			}
			switch (parts[4]) {
				case 'setpointStateId':
					return mapping.setpointStateId;
				case 'feedbackStateId':
					return mapping.feedbackStateId || '';
				case 'feedbackMode':
					return mapping.feedbackMode;
				case 'feedbackIntervalMinutes':
					return mapping.feedbackIntervalMinutes ?? 0;
				case 'deviationCountBeforeWrite':
					return mapping.deviationCountBeforeWrite;
				default:
					return undefined;
			}
		}
		if (parts[2] !== 'heatingModes' || parts.length < 5) {
			return undefined;
		}
		const mode = schedule.heatingModes.find(candidate => candidate.id === parts[3]);
		if (!mode) {
			return undefined;
		}
		if (parts[4] === 'weekdays' && parts.length === 6) {
			const weekday = WEEKDAY_NAMES.indexOf(parts[5] as WeekdayName) + 1;
			return weekday >= 1 ? mode.weekdays.includes(weekday) : undefined;
		}
		switch (parts[4]) {
			case 'weekdaySelection':
				return mode.weekdaySelection;
			case 'startTime':
				return mode.startTime;
			case 'startDate':
				return mode.startDate || '';
			case 'endDate':
				return mode.endDate || '';
			case 'temperature':
				return mode.temperature;
			default:
				return undefined;
		}
	}

	private getFiniteNumber(value: ioBroker.StateValue): number {
		const number = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(number)) {
			throw new Error('Value must be a finite number');
		}
		return number;
	}

	private getPositiveNumber(value: ioBroker.StateValue): number {
		const number = this.getFiniteNumber(value);
		if (number <= 0) {
			throw new Error('Value must be greater than zero');
		}
		return number;
	}

	private getPositiveInteger(value: ioBroker.StateValue): number {
		const number = this.getFiniteNumber(value);
		if (!Number.isSafeInteger(number) || number < 1) {
			throw new Error('Value must be a positive integer');
		}
		return number;
	}

	private async executeHeatingMode(scheduleId: string, modeId: string): Promise<void> {
		const schedule = this.configuration.schedules.find(candidate => candidate.id === scheduleId);
		const mode = schedule?.heatingModes.find(candidate => candidate.id === modeId);
		if (!schedule || !mode) {
			throw new Error(`Heating mode ${modeId} does not exist on schedule ${scheduleId}`);
		}
		if (!schedule.setpointMappings.length) {
			this.log.warn(`Heating mode ${scheduleId}/${modeId} has no setpoint mapping`);
			return;
		}
		for (const mapping of schedule.setpointMappings) {
			try {
				await this.writeSetpointForMapping(scheduleId, mapping, mode.temperature, `${scheduleId}/${modeId}`);
			} catch (error) {
				this.log.error(
					`Could not write setpoint mapping ${scheduleId}/${mapping.id} for heating mode ${modeId}: ${String(error)}`,
				);
			}
		}
	}

	private async executeCurrentHeatingMode(scheduleId: string): Promise<void> {
		const schedule = this.configuration.schedules.find(candidate => candidate.id === scheduleId);
		if (!schedule) {
			throw new Error(`Heating schedule ${scheduleId} does not exist`);
		}
		const now = new Date();
		const weekday = ((now.getDay() + 6) % 7) + 1;
		const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
		const mode = selectHeatingModeForManualActivation(schedule, weekday, minutesSinceMidnight);
		if (!mode) {
			this.log.warn(`No matching heating mode found for manual activation of ${scheduleId}`);
			return;
		}
		await this.executeHeatingMode(scheduleId, mode.id);
	}

	private async executeEnabledModeMatchingHeatingMode(
		scheduleId: string,
		requireScheduleEnabled: boolean,
	): Promise<void> {
		const schedule = this.configuration.schedules.find(candidate => candidate.id === scheduleId);
		if (!schedule) {
			throw new Error(`Heating schedule ${scheduleId} does not exist`);
		}
		if (requireScheduleEnabled && (await this.getStateAsync(`schedules.${scheduleId}.enabled`))?.val !== true) {
			this.log.debug(`Skipped enabled heating mode application for disabled schedule ${scheduleId}`);
			return;
		}
		const enabledModes: HeatingSchedule['heatingModes'] = [];
		for (const mode of schedule.heatingModes) {
			if ((await this.getStateAsync(`schedules.${scheduleId}.heatingModes.${mode.id}.enabled`))?.val === true) {
				enabledModes.push(mode);
			}
		}
		if (!enabledModes.length) {
			this.log.debug(`Skipped enabled-mode matching for ${scheduleId}: no mode is enabled`);
			return;
		}
		const now = new Date();
		const weekday = ((now.getDay() + 6) % 7) + 1;
		const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
		const mode = selectHeatingModeForManualActivation(
			{ heatingModes: enabledModes },
			weekday,
			minutesSinceMidnight,
			false,
		);
		if (!mode) {
			this.log.debug(`Skipped enabled heating mode application for ${scheduleId}: no matching mode`);
			return;
		}
		await this.executeHeatingMode(scheduleId, mode.id);
	}

	private feedbackKey(scheduleId: string, mappingId: string): string {
		return `${scheduleId}:${mappingId}`;
	}

	private async handleFeedbackStateChange(id: string, state: ioBroker.State): Promise<void> {
		const feedbackMappings: Array<{
			scheduleId: string;
			mapping: HeatingSchedule['setpointMappings'][number];
		}> = [];
		for (const schedule of this.configuration.schedules) {
			const mappings = schedule.setpointMappings.filter(mapping => mapping.feedbackStateId === id);
			if (!mappings.length) {
				continue;
			}
			if ((await this.getStateAsync(`schedules.${schedule.id}.enabled`))?.val !== true) {
				for (const mapping of mappings) {
					this.feedbackDeviationCounts.delete(this.feedbackKey(schedule.id, mapping.id));
				}
				continue;
			}
			feedbackMappings.push(...mappings.map(mapping => ({ scheduleId: schedule.id, mapping })));
		}
		if (!feedbackMappings.length) {
			return;
		}
		const currentValue = this.asNumericStateValue(state.val);
		if (currentValue === undefined) {
			return;
		}
		const previousValue = this.lastFeedbackValues.get(id);
		const changed = previousValue === undefined || !this.sameNumber(previousValue, currentValue);
		this.lastFeedbackValues.set(id, currentValue);
		for (const entry of feedbackMappings) {
			const key = this.feedbackKey(entry.scheduleId, entry.mapping.id);
			if (entry.mapping.feedbackMode === 1) {
				const token = this.feedbackUpdateToken(state);
				if (token && this.lastFeedbackUpdateTokens.get(key) === token) {
					continue;
				}
				if (token) {
					this.lastFeedbackUpdateTokens.set(key, token);
				}
			}
			if (entry.mapping.feedbackMode === 2) {
				await this.evaluateFeedback(entry.scheduleId, entry.mapping, key, currentValue, false);
				continue;
			}
			if (entry.mapping.feedbackMode === 0 && !changed) {
				continue;
			}
			await this.evaluateFeedback(entry.scheduleId, entry.mapping, key, currentValue, true);
		}
	}

	private async pollFeedbackStates(): Promise<void> {
		for (const stateId of this.monitoredStateSubscriptions) {
			const state = await this.getForeignStateAsync(stateId);
			if (state) {
				await this.handleFeedbackStateChange(stateId, state);
			}
		}
	}

	private feedbackUpdateToken(state: ioBroker.State): string {
		return state.ts !== undefined
			? `ts:${state.ts}`
			: `value:${typeof state.val === 'object' ? JSON.stringify(state.val) : String(state.val)}`;
	}

	private async checkCyclicFeedback(scheduleId: string, mappingId: string): Promise<void> {
		const schedule = this.configuration.schedules.find(candidate => candidate.id === scheduleId);
		const mapping = schedule?.setpointMappings.find(candidate => candidate.id === mappingId);
		if (!mapping?.feedbackStateId || mapping.feedbackMode !== 2) {
			return;
		}
		if ((await this.getStateAsync(`schedules.${scheduleId}.enabled`))?.val !== true) {
			this.feedbackDeviationCounts.delete(this.feedbackKey(scheduleId, mappingId));
			return;
		}
		const state = await this.getForeignStateAsync(mapping.feedbackStateId);
		const currentValue = this.asNumericStateValue(state?.val);
		if (currentValue === undefined) {
			return;
		}
		this.lastFeedbackValues.set(mapping.feedbackStateId, currentValue);
		await this.evaluateFeedback(scheduleId, mapping, this.feedbackKey(scheduleId, mappingId), currentValue, true);
	}

	private async evaluateFeedback(
		scheduleId: string,
		mapping: HeatingSchedule['setpointMappings'][number],
		key: string,
		currentValue: number,
		countDeviation: boolean,
	): Promise<void> {
		const scheduleEnabled = await this.getStateAsync(`schedules.${scheduleId}.enabled`);
		if (scheduleEnabled?.val !== true) {
			this.feedbackDeviationCounts.delete(key);
			return;
		}
		const setpointState = await this.getForeignStateAsync(mapping.setpointStateId);
		const currentSetpoint = this.asNumericStateValue(setpointState?.val);
		if (currentSetpoint === undefined) {
			return;
		}
		if (this.sameNumber(currentValue, currentSetpoint)) {
			this.feedbackDeviationCounts.delete(key);
			return;
		}
		if (!countDeviation) {
			return;
		}
		const deviationCount = (this.feedbackDeviationCounts.get(key) || 0) + 1;
		this.log.debug(
			`Feedback deviation for ${key}: received ${currentValue}, current setpoint ${currentSetpoint}, count ${deviationCount}/${mapping.deviationCountBeforeWrite}`,
		);
		if (deviationCount < mapping.deviationCountBeforeWrite) {
			this.feedbackDeviationCounts.set(key, deviationCount);
			return;
		}
		this.feedbackDeviationCounts.delete(key);
		await this.writeSetpointForMapping(scheduleId, mapping, currentSetpoint, 'feedback deviation');
	}

	private async writeSetpointForMapping(
		scheduleId: string,
		mapping: HeatingSchedule['setpointMappings'][number],
		value: number,
		reason: string,
	): Promise<void> {
		const setpointObject = await this.getForeignObjectAsync(mapping.setpointStateId);
		if (setpointObject?.type !== 'state' || setpointObject.common?.type !== 'number') {
			throw new Error(`Setpoint state ${mapping.setpointStateId} does not exist or is not a number state`);
		}
		if (mapping.feedbackStateId) {
			const feedbackObject = await this.getForeignObjectAsync(mapping.feedbackStateId);
			if (feedbackObject?.type !== 'state' || feedbackObject.common?.type !== 'number') {
				throw new Error(`Feedback state ${mapping.feedbackStateId} does not exist or is not a number state`);
			}
		}
		await this.setForeignStateAsync(mapping.setpointStateId, { val: value, ack: false });
		this.log.debug(`Wrote ${value} to ${mapping.setpointStateId} (${reason})`);
	}

	private asNumericStateValue(value: ioBroker.StateValue | undefined): number | undefined {
		if (value === undefined || value === null || value === '') {
			return undefined;
		}
		const number = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(number) ? number : undefined;
	}

	private sameNumber(left: number, right: number): boolean {
		return Math.abs(left - right) < 0.0001;
	}

	private async evaluateSchedules(): Promise<void> {
		const now = new Date();
		const date = this.localDate();
		const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
		const weekday = ((now.getDay() + 6) % 7) + 1;
		await this.applyDateActivationTransitions(date);
		for (const schedule of this.configuration.schedules) {
			const scheduleEnabled = await this.getStateAsync(`schedules.${schedule.id}.enabled`);
			if (scheduleEnabled?.val !== true) {
				continue;
			}
			for (const mode of schedule.heatingModes) {
				const modeEnabled = await this.getStateAsync(
					`schedules.${schedule.id}.heatingModes.${mode.id}.enabled`,
				);
				if (modeEnabled?.val !== true) {
					continue;
				}
				const weekdayMatches =
					mode.weekdaySelection === 0
						? true
						: mode.weekdaySelection === 1
							? mode.weekdays.includes(weekday)
							: !mode.weekdays.includes(weekday);
				if (!weekdayMatches || mode.startTime !== time) {
					continue;
				}
				const scheduleKey = `${date}T${mode.startTime}`;
				const executionKey = this.feedbackKey(schedule.id, mode.id);
				if (this.lastScheduleExecutions.get(executionKey) === scheduleKey) {
					continue;
				}
				await this.executeHeatingMode(schedule.id, mode.id);
				this.lastScheduleExecutions.set(executionKey, scheduleKey);
			}
		}
	}

	private scheduleConfigurationBackup(): void {
		if (this.configurationBackupTimer) {
			this.clearTimeout(this.configurationBackupTimer);
			this.configurationBackupTimer = undefined;
		}
		const delayMinutes = Number(this.config.configurationBackupDelayMinutes ?? 60);
		if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
			return;
		}
		this.configurationBackupTimer = this.setTimeout(
			() => {
				this.configurationBackupTimer = undefined;
				this.trackEventOperation('schedule configuration backup', async () => {
					try {
						await this.backupScheduleConfiguration();
					} catch (error) {
						this.log.error(`Could not back up schedule configuration: ${String(error)}`);
					}
				});
			},
			Math.min(delayMinutes, 35_791) * 60_000,
		);
	}

	private async backupScheduleConfiguration(): Promise<boolean> {
		await this.configurationQueue;
		const schedulesFolder = await this.getObjectAsync('schedules');
		if (!schedulesFolder?.native) {
			throw new Error('The schedules folder does not exist');
		}
		const instanceId = `system.adapter.${this.namespace}`;
		const instanceObject = (await this.getForeignObjectAsync(instanceId)) as ioBroker.InstanceObject | null;
		if (!instanceObject) {
			throw new Error(`The instance object ${instanceId} does not exist`);
		}
		const native = normalizeConfiguration(schedulesFolder.native);
		const instanceNative = instanceObject.native || {};
		if (!configurationBackupNeedsUpdate(native, instanceNative.scheduleConfigurationBackup)) {
			return false;
		}
		instanceObject.native = {
			...instanceNative,
			scheduleConfigurationBackup: structuredClone(native),
		};
		await this.setForeignObjectAsync(instanceId, instanceObject);
		this.log.info('Updated the schedule configuration backup in the instance object');
		return true;
	}

	private async restoreScheduleConfigurationBackup(rebuild: boolean): Promise<boolean> {
		await this.configurationQueue;
		const instanceId = `system.adapter.${this.namespace}`;
		const instanceObject = (await this.getForeignObjectAsync(instanceId)) as ioBroker.InstanceObject | null;
		const backup = getRestorableConfigurationBackup(instanceObject?.native?.scheduleConfigurationBackup);
		if (!backup) {
			return false;
		}
		if (rebuild) {
			await this.persistConfiguration(backup);
		} else {
			this.configuration = backup;
		}
		return true;
	}

	private async onMessage(message: ioBroker.Message): Promise<void> {
		if (this.unloading) {
			return;
		}
		if (message.command !== 'backupScheduleConfiguration' && message.command !== 'restoreScheduleConfiguration') {
			return;
		}
		try {
			const changed =
				message.command === 'backupScheduleConfiguration'
					? await this.backupScheduleConfiguration()
					: await this.restoreScheduleConfigurationBackup(true);
			this.sendTo(
				message.from,
				message.command,
				{
					result:
						message.command === 'backupScheduleConfiguration'
							? changed
								? 'backupUpdated'
								: 'backupCurrent'
							: changed
								? 'backupRestored'
								: 'backupMissing',
				},
				message.callback,
			);
		} catch (error) {
			this.sendTo(message.from, message.command, { error: String(error) }, message.callback);
		}
	}

	private onUnload(callback: () => void): void {
		this.unloading = true;
		if (this.configurationBackupTimer) {
			this.clearTimeout(this.configurationBackupTimer);
			this.configurationBackupTimer = undefined;
		}
		if (this.scheduleTimer) {
			this.clearInterval(this.scheduleTimer);
			this.scheduleTimer = undefined;
		}
		if (this.feedbackPollTimer) {
			this.clearInterval(this.feedbackPollTimer);
			this.feedbackPollTimer = undefined;
		}
		for (const timer of this.feedbackTimers.values()) {
			this.clearInterval(timer);
		}
		this.feedbackTimers.clear();
		for (const stateId of this.monitoredStateSubscriptions) {
			this.unsubscribeForeignStates(stateId);
		}
		this.monitoredStateSubscriptions.clear();
		this.lastFeedbackUpdateTokens.clear();
		this.lastFeedbackValues.clear();
		const pending = [...this.pendingOperations];
		if (!pending.length) {
			callback();
			return;
		}
		let callbackCalled = false;
		const finish = (): void => {
			if (callbackCalled) {
				return;
			}
			callbackCalled = true;
			callback();
		};
		const timeout = this.setTimeout(finish, 5_000);
		void Promise.allSettled(pending).then(() => {
			this.clearTimeout(timeout);
			finish();
		});
	}

	private trackEventOperation(operation: string, task: () => Promise<void>): void {
		if (this.unloading) {
			return;
		}
		let promise: Promise<void>;
		try {
			promise = task();
		} catch (error) {
			this.log.error(`${operation} failed: ${String(error)}`);
			return;
		}
		this.pendingOperations.add(promise);
		void promise
			.catch(error => {
				if (!this.unloading) {
					this.log.error(`${operation} failed: ${String(error)}`);
				}
			})
			.finally(() => this.pendingOperations.delete(promise));
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HeatingScheduler(options);
} else {
	(() => new HeatingScheduler())();
}
