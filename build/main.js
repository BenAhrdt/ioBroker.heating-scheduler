"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_configuration = require("./lib/configuration");
var import_configuration_backup = require("./lib/configuration-backup");
var import_schedule_management = require("./lib/schedule-management");
var import_schedule_operations = require("./lib/schedule-operations");
const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const FEEDBACK_MODE_STATES = {
  0: "On change",
  1: "On update",
  2: "Cyclic"
};
const WEEKDAY_SELECTION_STATES = {
  0: "All weekdays",
  1: "Include selected days",
  2: "Exclude selected days"
};
class HeatingScheduler extends utils.Adapter {
  configuration = (0, import_configuration.normalizeConfiguration)(void 0);
  scheduleManagement;
  configurationBackupTimer;
  scheduleTimer;
  feedbackPollTimer;
  feedbackTimers = /* @__PURE__ */ new Map();
  monitoredStateSubscriptions = /* @__PURE__ */ new Set();
  feedbackDeviationCounts = /* @__PURE__ */ new Map();
  lastFeedbackValues = /* @__PURE__ */ new Map();
  lastFeedbackUpdateTokens = /* @__PURE__ */ new Map();
  lastAppliedModes = /* @__PURE__ */ new Map();
  processedActivationTransitions = /* @__PURE__ */ new Set();
  configurationQueue = Promise.resolve();
  pendingOperations = /* @__PURE__ */ new Set();
  unloading = false;
  constructor(options = {}) {
    super({
      ...options,
      name: "heating-scheduler"
    });
    this.on("ready", () => this.trackEventOperation("startup", () => this.onReady()));
    this.on(
      "stateChange",
      (id, state) => this.trackEventOperation(`state change for ${id}`, () => this.onStateChange(id, state))
    );
    this.on(
      "message",
      (message) => this.trackEventOperation(`message ${message.command}`, () => this.onMessage(message))
    );
    this.on("unload", (callback) => this.onUnload(callback));
  }
  /** Initializes the persisted configuration and the neutral Device Manager. */
  async onReady() {
    if (this.unloading) {
      return;
    }
    await this.setState("info.connection", false, true);
    this.scheduleManagement = new import_schedule_management.HeatingSchedulerManagement(this);
    await this.ensureInfoObjects();
    const schedulesFolder = await this.getObjectAsync("schedules");
    this.configuration = (0, import_configuration.normalizeConfiguration)(schedulesFolder == null ? void 0 : schedulesFolder.native);
    if ((0, import_configuration.isEmptyConfiguration)(this.configuration)) {
      const restored = await this.restoreScheduleConfigurationBackup(false);
      if (restored) {
        this.log.info("Restored the schedule configuration from the instance backup");
      }
    }
    await this.persistConfiguration(void 0);
    this.subscribeStates("schedules.*");
    this.startScheduleTimer();
    await this.setState("info.connection", true, true);
    this.subscribeStates("info.expertMode");
    this.scheduleConfigurationBackup();
  }
  async ensureInfoObjects() {
    await this.setObjectNotExistsAsync("info.deviceManager", {
      type: "state",
      common: {
        name: {
          en: "Device Manager communication",
          de: "Device-Manager-Kommunikation"
        },
        type: "string",
        role: "indicator",
        read: true,
        write: false,
        def: ""
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("info.expertMode", {
      type: "state",
      common: {
        name: {
          en: "Device Manager expert mode",
          de: "Device-Manager-Expertenmodus"
        },
        type: "boolean",
        role: "switch",
        read: true,
        write: true,
        def: false
      },
      native: {}
    });
    const expertMode = await this.getStateAsync("info.expertMode");
    if ((expertMode == null ? void 0 : expertMode.val) !== true && (expertMode == null ? void 0 : expertMode.val) !== false) {
      await this.setStateAsync("info.expertMode", { val: false, ack: true });
    }
  }
  getHeatingSchedules() {
    return this.configuration.schedules.map((schedule) => ({ ...schedule }));
  }
  async getNumericStateNames() {
    const objects = await this.getForeignObjectsAsync("*", "state");
    return Object.fromEntries(
      Object.entries(objects).filter(([, object]) => {
        var _a;
        return ((_a = object.common) == null ? void 0 : _a.type) === "number";
      }).map(([id, object]) => {
        var _a;
        const name = (_a = object.common) == null ? void 0 : _a.name;
        const localizedName = name && typeof name === "object" ? name.de || name.en : void 0;
        const displayName = typeof name === "string" ? name : typeof localizedName === "string" ? localizedName : id;
        return [id, displayName];
      })
    );
  }
  async addHeatingSchedule(name, heatingType = import_configuration.DEFAULT_HEATING_TYPE) {
    return this.enqueueConfigurationMutation((current) => {
      const changed = (0, import_schedule_operations.addScheduleToConfiguration)(current, name, heatingType);
      return {
        result: changed.id,
        configuration: changed.configuration
      };
    });
  }
  async renameHeatingSchedule(id, name, heatingType) {
    return this.enqueueConfigurationMutation((current) => {
      return {
        result: void 0,
        configuration: (0, import_schedule_operations.renameScheduleInConfiguration)(current, id, name, heatingType)
      };
    });
  }
  async removeHeatingSchedule(id) {
    return this.enqueueConfigurationMutation((current) => {
      return {
        result: void 0,
        configuration: (0, import_schedule_operations.removeScheduleFromConfiguration)(current, id)
      };
    });
  }
  async updateHeatingSchedule(id, patch) {
    const validNumericStateIds = new Set(Object.keys(await this.getNumericStateNames()));
    return this.enqueueConfigurationMutation(
      (current) => ({
        result: void 0,
        configuration: (0, import_schedule_operations.updateScheduleConfiguration)(current, id, patch, validNumericStateIds)
      }),
      id
    );
  }
  enqueueConfigurationMutation(mutation, activationScheduleId) {
    let result;
    const operation = this.configurationQueue.then(async () => {
      const changed = mutation(this.configuration);
      result = changed.result;
      await this.persistConfiguration(changed.configuration, activationScheduleId);
    });
    this.configurationQueue = operation.then(
      () => void 0,
      () => void 0
    );
    this.pendingOperations.add(operation);
    void operation.then(
      () => this.pendingOperations.delete(operation),
      () => this.pendingOperations.delete(operation)
    );
    return operation.then(() => result);
  }
  async persistConfiguration(next, activationScheduleId) {
    var _a;
    const previous = this.configuration;
    if (next) {
      this.configuration = (0, import_configuration.normalizeConfiguration)(next);
      this.lastAppliedModes.clear();
    }
    await this.setObjectAsync("schedules", {
      type: "folder",
      common: {
        name: {
          en: "Schedules",
          de: "Heizpl\xE4ne"
        }
      },
      native: structuredClone(this.configuration)
    });
    await this.synchronizeScheduleObjects(previous, this.configuration);
    (_a = this.scheduleManagement) == null ? void 0 : _a.refreshDeviceCache();
    if (next && activationScheduleId) {
      await this.applyInitialActivationStates(previous, activationScheduleId);
    }
    await this.synchronizeFeedbackMonitoring(previous, this.configuration);
    if (next) {
      this.scheduleConfigurationBackup();
    }
  }
  async synchronizeFeedbackMonitoring(_previous, next) {
    const nextMappings = next.schedules.flatMap(
      (schedule) => schedule.setpointMappings.filter((mapping) => !!mapping.feedbackStateId).map((mapping) => ({ scheduleId: schedule.id, mapping }))
    );
    const nextMonitoredStates = new Set(
      nextMappings.flatMap((entry) => [entry.mapping.setpointStateId, entry.mapping.feedbackStateId])
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
      const state = await this.getForeignStateAsync(entry.mapping.feedbackStateId);
      const currentValue = this.asNumericStateValue(state == null ? void 0 : state.val);
      if (state && currentValue !== void 0) {
        this.lastFeedbackValues.set(entry.mapping.feedbackStateId, currentValue);
        this.lastFeedbackUpdateTokens.set(
          this.feedbackKey(entry.scheduleId, entry.mapping.id),
          this.feedbackUpdateToken(state)
        );
      }
    }
    if (nextMappings.length && !this.feedbackPollTimer) {
      this.feedbackPollTimer = this.setInterval(
        () => this.trackEventOperation("feedback state polling", () => this.pollFeedbackStates()),
        1e3
      );
    }
    if (!nextMappings.length && this.feedbackPollTimer) {
      this.clearInterval(this.feedbackPollTimer);
      this.feedbackPollTimer = void 0;
    }
    for (const timer of this.feedbackTimers.values()) {
      this.clearInterval(timer);
    }
    this.feedbackTimers.clear();
    const validKeys = /* @__PURE__ */ new Set();
    for (const entry of nextMappings) {
      const key = this.feedbackKey(entry.scheduleId, entry.mapping.id);
      validKeys.add(key);
      if (entry.mapping.feedbackMode !== 2) {
        continue;
      }
      const intervalMinutes = Math.max(1, entry.mapping.feedbackIntervalMinutes || 1);
      const timer = this.setInterval(
        () => this.trackEventOperation(
          `cyclic feedback ${key}`,
          () => this.checkCyclicFeedback(entry.scheduleId, entry.mapping.id)
        ),
        intervalMinutes * 6e4
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
  startScheduleTimer() {
    if (this.scheduleTimer) {
      this.clearInterval(this.scheduleTimer);
    }
    this.scheduleTimer = this.setInterval(
      () => this.trackEventOperation("schedule evaluation", () => this.evaluateSchedules()),
      3e4
    );
    this.trackEventOperation("initial schedule evaluation", () => this.evaluateSchedules());
  }
  localDate() {
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  async applyInitialActivationStates(previous, scheduleId) {
    const date = this.localDate();
    for (const schedule of this.configuration.schedules) {
      if (schedule.id !== scheduleId) {
        continue;
      }
      const previousSchedule = previous.schedules.find((candidate) => candidate.id === schedule.id);
      const scheduleDatesChanged = !previousSchedule || previousSchedule.startDate !== schedule.startDate || previousSchedule.endDate !== schedule.endDate;
      if (scheduleDatesChanged) {
        const scheduleEnabled = schedule.startDate || schedule.endDate ? (0, import_configuration.isDateInActivationRange)(date, schedule.startDate, schedule.endDate, true) : true;
        await this.setStateChangedAsync(`schedules.${schedule.id}.enabled`, {
          val: scheduleEnabled,
          ack: true
        });
      }
      for (const mode of schedule.heatingModes) {
        const previousMode = previousSchedule == null ? void 0 : previousSchedule.heatingModes.find((candidate) => candidate.id === mode.id);
        const modeDatesChanged = !previousMode || previousMode.startDate !== mode.startDate || previousMode.endDate !== mode.endDate;
        if (modeDatesChanged) {
          const modeEnabled = mode.startDate || mode.endDate ? (0, import_configuration.isDateInActivationRange)(date, mode.startDate, mode.endDate, false) : false;
          await this.setStateChangedAsync(`schedules.${schedule.id}.heatingModes.${mode.id}.enabled`, {
            val: modeEnabled,
            ack: true
          });
        }
      }
    }
  }
  async applyDateActivationTransition(stateId, startDate, endDate, date) {
    var _a;
    let currentValue = (_a = await this.getStateAsync(stateId)) == null ? void 0 : _a.val;
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
  async applyDateActivationTransitions(date) {
    for (const schedule of this.configuration.schedules) {
      await this.applyDateActivationTransition(
        `schedules.${schedule.id}.enabled`,
        schedule.startDate,
        schedule.endDate,
        date
      );
      for (const mode of schedule.heatingModes) {
        await this.applyDateActivationTransition(
          `schedules.${schedule.id}.heatingModes.${mode.id}.enabled`,
          mode.startDate,
          mode.endDate,
          date
        );
      }
    }
  }
  async synchronizeScheduleObjects(previous, next) {
    var _a, _b;
    const nextIds = new Set(next.schedules.map((schedule) => schedule.id));
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
        type: "device",
        common: { name: schedule.name },
        native: {}
      });
      await this.delObjectAsync(`schedules.${schedule.id}.name`);
      await this.ensureRuntimeState(
        `schedules.${schedule.id}.enabled`,
        {
          name: { en: "Heating schedule enabled", de: "Heizplan aktiviert" },
          type: "boolean",
          role: "switch",
          read: true,
          write: true
        },
        schedule.startDate || schedule.endDate ? (0, import_configuration.isDateInActivationRange)(date, schedule.startDate, schedule.endDate, true) : true,
        `schedules.${schedule.id}.active`
      );
      await this.ensureRuntimeState(
        `schedules.${schedule.id}.applyMatching`,
        {
          name: { en: "Apply matching setpoint", de: "Passenden Sollwert anwenden" },
          type: "boolean",
          role: "button",
          read: false,
          write: true
        },
        false,
        `schedules.${schedule.id}.activate`,
        false
      );
      await this.ensureRuntimeState(
        `schedules.${schedule.id}.applyEnabledMatching`,
        {
          name: { en: "Apply enabled matching setpoint", de: "Passenden aktivierten Sollwert anwenden" },
          type: "boolean",
          role: "button",
          read: false,
          write: true
        },
        false,
        `schedules.${schedule.id}.activateActive`,
        false
      );
      await this.ensureRuntimeState(
        `schedules.${schedule.id}.applyEnabledModeMatching`,
        {
          name: { en: "Apply enabled-mode matching setpoint", de: "Sollwert des aktivierten Modus anwenden" },
          type: "boolean",
          role: "button",
          read: false,
          write: true
        },
        false
      );
      await this.ensureConfigurationState(
        `schedules.${schedule.id}.startDate`,
        {
          name: { en: "Activate from (optional)", de: "Aktivieren ab (optional)" },
          type: "string",
          role: "date.start",
          read: true,
          write: true
        },
        (_a = schedule.startDate) != null ? _a : ""
      );
      await this.ensureConfigurationState(
        `schedules.${schedule.id}.endDate`,
        {
          name: { en: "Deactivate from (optional)", de: "Deaktivieren ab (optional)" },
          type: "string",
          role: "date.end",
          read: true,
          write: true
        },
        (_b = schedule.endDate) != null ? _b : ""
      );
      const previousSchedule = previous.schedules.find((candidate) => candidate.id === schedule.id);
      await this.synchronizeSetpointMappingObjects(schedule, previousSchedule);
      await this.synchronizeHeatingModeObjects(schedule, previousSchedule);
    }
  }
  async synchronizeSetpointMappingObjects(schedule, previousSchedule) {
    var _a, _b;
    const base = `schedules.${schedule.id}.setpointMappings`;
    if (!schedule.setpointMappings.length) {
      if (previousSchedule == null ? void 0 : previousSchedule.setpointMappings.length) {
        await this.delObjectAsync(base, { recursive: true });
      }
      return;
    }
    const nextIds = new Set(schedule.setpointMappings.map((mapping) => mapping.id));
    for (const mapping of (previousSchedule == null ? void 0 : previousSchedule.setpointMappings) || []) {
      if (!nextIds.has(mapping.id)) {
        await this.delObjectAsync(`${base}.${mapping.id}`, { recursive: true });
      }
    }
    await this.setObjectAsync(base, {
      type: "channel",
      common: { name: { en: "Setpoint mappings", de: "Sollwert-Zuordnungen" } },
      native: {}
    });
    for (const mapping of schedule.setpointMappings) {
      const mappingBase = `${base}.${mapping.id}`;
      await this.setObjectAsync(mappingBase, {
        type: "channel",
        common: { name: mapping.setpointStateId },
        native: {}
      });
      await this.ensureConfigurationState(
        `${mappingBase}.setpointStateId`,
        {
          name: { en: "Setpoint state ID", de: "Sollwert-State-ID" },
          type: "string",
          role: "text",
          read: true,
          write: true
        },
        mapping.setpointStateId
      );
      if (mapping.feedbackStateId) {
        await this.ensureConfigurationState(
          `${mappingBase}.feedbackStateId`,
          {
            name: { en: "Feedback state ID", de: "R\xFCckmelde-State-ID" },
            type: "string",
            role: "text",
            read: true,
            write: true
          },
          mapping.feedbackStateId
        );
      } else if ((_a = previousSchedule == null ? void 0 : previousSchedule.setpointMappings.find((entry) => entry.id === mapping.id)) == null ? void 0 : _a.feedbackStateId) {
        await this.delObjectAsync(`${mappingBase}.feedbackStateId`);
      }
      await this.ensureConfigurationState(
        `${mappingBase}.feedbackMode`,
        {
          name: { en: "Feedback mode", de: "R\xFCckmeldeart" },
          type: "number",
          role: "value",
          states: FEEDBACK_MODE_STATES,
          min: 0,
          max: 2,
          step: 1,
          read: true,
          write: true
        },
        mapping.feedbackMode
      );
      await this.ensureConfigurationState(
        `${mappingBase}.feedbackIntervalMinutes`,
        {
          name: { en: "Feedback interval in minutes", de: "R\xFCckmeldeintervall in Minuten" },
          type: "number",
          role: "time.interval",
          unit: "min",
          min: 0,
          read: true,
          write: true
        },
        (_b = mapping.feedbackIntervalMinutes) != null ? _b : 0
      );
      await this.ensureConfigurationState(
        `${mappingBase}.deviationCountBeforeWrite`,
        {
          name: { en: "Deviations before write", de: "Abweichungen bis zum erneuten Schreiben" },
          type: "number",
          role: "level",
          min: 1,
          read: true,
          write: true
        },
        mapping.deviationCountBeforeWrite
      );
    }
  }
  async synchronizeHeatingModeObjects(schedule, previousSchedule) {
    var _a, _b;
    const base = `schedules.${schedule.id}.heatingModes`;
    if (!schedule.heatingModes.length) {
      if (previousSchedule == null ? void 0 : previousSchedule.heatingModes.length) {
        await this.delObjectAsync(base, { recursive: true });
      }
      return;
    }
    const nextIds = new Set(schedule.heatingModes.map((mode) => mode.id));
    for (const mode of (previousSchedule == null ? void 0 : previousSchedule.heatingModes) || []) {
      if (!nextIds.has(mode.id)) {
        await this.delObjectAsync(`${base}.${mode.id}`, { recursive: true });
      }
    }
    await this.setObjectAsync(base, {
      type: "channel",
      common: { name: { en: "Heating modes", de: "Heizmodi" } },
      native: {}
    });
    for (const mode of schedule.heatingModes) {
      const modeBase = `${base}.${mode.id}`;
      await this.setObjectAsync(modeBase, {
        type: "channel",
        common: { name: mode.name },
        native: {}
      });
      await this.delObjectAsync(`${modeBase}.name`);
      await this.setObjectAsync(`${modeBase}.weekdays`, {
        type: "channel",
        common: { name: { en: "Weekdays", de: "Wochentage" } },
        native: {}
      });
      for (let day = 1; day <= 7; day += 1) {
        const weekday = WEEKDAY_NAMES[day - 1];
        await this.ensureConfigurationState(
          `${modeBase}.weekdays.${weekday}`,
          {
            name: { en: weekday, de: this.getGermanWeekdayName(weekday) },
            type: "boolean",
            role: "switch",
            read: true,
            write: true
          },
          mode.weekdays.includes(day)
        );
      }
      await this.ensureConfigurationState(
        `${modeBase}.weekdaySelection`,
        {
          name: { en: "Weekday selection", de: "Wochentagauswahl" },
          type: "number",
          role: "value",
          states: WEEKDAY_SELECTION_STATES,
          min: 0,
          max: 2,
          step: 1,
          read: true,
          write: true
        },
        mode.weekdaySelection
      );
      await this.ensureConfigurationState(
        `${modeBase}.startDate`,
        {
          name: { en: "Activate from (optional)", de: "Aktivieren ab (optional)" },
          type: "string",
          role: "date.start",
          read: true,
          write: true
        },
        (_a = mode.startDate) != null ? _a : ""
      );
      await this.ensureConfigurationState(
        `${modeBase}.endDate`,
        {
          name: { en: "Deactivate from (optional)", de: "Deaktivieren ab (optional)" },
          type: "string",
          role: "date.end",
          read: true,
          write: true
        },
        (_b = mode.endDate) != null ? _b : ""
      );
      await this.ensureConfigurationState(
        `${modeBase}.startTime`,
        {
          name: { en: "Time", de: "Zeit" },
          type: "string",
          role: "text",
          read: true,
          write: true
        },
        mode.startTime
      );
      await this.ensureConfigurationState(
        `${modeBase}.temperature`,
        {
          name: { en: "Temperature", de: "Temperatur" },
          type: "number",
          role: "level.temperature",
          unit: "\xB0C",
          read: true,
          write: true
        },
        mode.temperature
      );
      await this.ensureConfigurationState(
        `${modeBase}.priority`,
        {
          name: { en: "Priority", de: "Priorit\xE4t" },
          type: "number",
          role: "value",
          min: 0,
          step: 1,
          read: true,
          write: true
        },
        mode.priority
      );
      await this.ensureRuntimeState(
        `${modeBase}.enabled`,
        {
          name: { en: "Enabled", de: "Aktiviert" },
          type: "boolean",
          role: "switch",
          read: true,
          write: true
        },
        mode.startDate || mode.endDate ? (0, import_configuration.isDateInActivationRange)(this.localDate(), mode.startDate, mode.endDate, false) : false,
        `${modeBase}.active`
      );
      await this.ensureRuntimeState(
        `${modeBase}.applyNow`,
        {
          name: { en: "Apply now", de: "Jetzt anwenden" },
          type: "boolean",
          role: "button",
          read: false,
          write: true
        },
        false,
        `${modeBase}.activate`,
        false
      );
    }
  }
  getGermanWeekdayName(weekday) {
    return {
      monday: "Montag",
      tuesday: "Dienstag",
      wednesday: "Mittwoch",
      thursday: "Donnerstag",
      friday: "Freitag",
      saturday: "Samstag",
      sunday: "Sonntag"
    }[weekday];
  }
  async ensureConfigurationState(id, common, value) {
    await this.setObjectAsync(id, { type: "state", common, native: {} });
    await this.setStateChangedAsync(id, { val: value, ack: true });
  }
  async ensureRuntimeState(id, common, defaultValue, legacyId, migrateLegacyValue = true) {
    const currentState = await this.getStateAsync(id);
    const legacyState = legacyId ? await this.getStateAsync(legacyId) : void 0;
    await this.setObjectAsync(id, { type: "state", common, native: {} });
    if (!currentState) {
      const legacyValue = migrateLegacyValue && typeof (legacyState == null ? void 0 : legacyState.val) === "boolean" ? legacyState.val : void 0;
      await this.setStateChangedAsync(id, { val: legacyValue != null ? legacyValue : defaultValue, ack: true });
    }
    if (legacyId) {
      await this.delObjectAsync(legacyId);
    }
  }
  async onStateChange(id, state) {
    var _a, _b, _c;
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
    if (relativeId === "info.expertMode") {
      if (typeof state.val !== "boolean") {
        throw new Error("The Device Manager expert mode state must be boolean");
      }
      await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
      return;
    }
    const parts = relativeId.split(".");
    if (parts[0] !== "schedules") {
      return;
    }
    try {
      const scheduleId = parts[1];
      if (parts.length === 3) {
        if (parts[2] === "enabled") {
          if (typeof state.val !== "boolean") {
            throw new Error("The schedule enabled state must be boolean");
          }
          await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
          this.lastAppliedModes.delete(scheduleId);
          await this.evaluateSchedules();
          return;
        }
        if (parts[2] === "applyMatching") {
          if (state.val === true) {
            await this.executeCurrentHeatingMode(scheduleId);
          }
          await this.setStateChangedAsync(relativeId, { val: false, ack: true });
          return;
        }
        if (parts[2] === "applyEnabledMatching") {
          try {
            if (state.val === true) {
              await this.executeEnabledModeMatchingHeatingMode(scheduleId, true);
            }
          } finally {
            await this.setStateChangedAsync(relativeId, { val: false, ack: true });
          }
          return;
        }
        if (parts[2] === "applyEnabledModeMatching") {
          try {
            if (state.val === true) {
              await this.executeEnabledModeMatchingHeatingMode(scheduleId, false);
            }
          } finally {
            await this.setStateChangedAsync(relativeId, { val: false, ack: true });
          }
          return;
        }
        if (parts[2] === "startDate" || parts[2] === "endDate") {
          const date = typeof state.val === "string" ? state.val.trim() : "";
          if (date && !(0, import_configuration.isValidCalendarDate)(date)) {
            throw new Error(`${parts[2]} must use YYYY-MM-DD`);
          }
          const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
          if (!schedule) {
            throw new Error(`Schedule ${scheduleId} does not exist`);
          }
          await this.updateConfigurationFromState(scheduleId, (current) => {
            if (date) {
              current[parts[2]] = date;
            } else {
              delete current[parts[2]];
            }
          });
          return;
        }
      }
      if (parts.length < 5) {
        return;
      }
      if (parts[2] === "setpointMappings") {
        const mappingId = parts[3];
        const field2 = parts[4];
        const mapping = (_a = this.configuration.schedules.find((schedule) => schedule.id === scheduleId)) == null ? void 0 : _a.setpointMappings.find((candidate) => candidate.id === mappingId);
        if (!mapping) {
          throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
        }
        if (field2 === "setpointStateId" || field2 === "feedbackStateId") {
          const stateId = typeof state.val === "string" ? state.val.trim() : "";
          if (field2 === "setpointStateId" && !stateId) {
            throw new Error("The Sollwert state ID must not be empty");
          }
          if (stateId) {
            const object = await this.getForeignObjectAsync(stateId);
            if ((object == null ? void 0 : object.type) !== "state" || ((_b = object.common) == null ? void 0 : _b.type) !== "number") {
              throw new Error(`${field2} must reference an existing number state`);
            }
          }
          await this.updateConfigurationFromState(scheduleId, (schedule) => {
            const target = schedule.setpointMappings.find((candidate) => candidate.id === mappingId);
            if (!target) {
              throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
            }
            if (field2 === "setpointStateId") {
              target.setpointStateId = stateId;
            } else if (stateId) {
              target.feedbackStateId = stateId;
            } else {
              delete target.feedbackStateId;
            }
          });
          return;
        }
        await this.updateConfigurationFromState(scheduleId, (schedule) => {
          const target = schedule.setpointMappings.find((candidate) => candidate.id === mappingId);
          if (!target) {
            throw new Error(`Setpoint mapping ${mappingId} does not exist on schedule ${scheduleId}`);
          }
          if (field2 === "feedbackMode") {
            if (!(0, import_configuration.isFeedbackMode)(state.val)) {
              throw new Error("Feedback mode must be 0, 1, or 2");
            }
            target.feedbackMode = state.val;
            return;
          }
          if (field2 === "feedbackIntervalMinutes") {
            const value = this.getPositiveNumber(state.val);
            target.feedbackIntervalMinutes = value;
            return;
          }
          if (field2 === "deviationCountBeforeWrite") {
            const value = this.getPositiveInteger(state.val);
            target.deviationCountBeforeWrite = value;
            return;
          }
          throw new Error(`Unknown setpoint mapping state ${field2}`);
        });
        return;
      }
      if (parts[2] !== "heatingModes") {
        return;
      }
      const modeId = parts[3];
      const field = parts[4];
      const mode = (_c = this.configuration.schedules.find((schedule) => schedule.id === scheduleId)) == null ? void 0 : _c.heatingModes.find((candidate) => candidate.id === modeId);
      if (!mode) {
        throw new Error(`Heating mode ${modeId} does not exist on schedule ${scheduleId}`);
      }
      if (field === "enabled" && parts.length === 5) {
        if (typeof state.val !== "boolean") {
          throw new Error("The heating-mode enabled state must be boolean");
        }
        await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
        this.lastAppliedModes.delete(scheduleId);
        await this.evaluateSchedules();
        return;
      }
      if (field === "applyNow" && parts.length === 5) {
        if (state.val === true) {
          await this.executeHeatingMode(scheduleId, modeId);
        }
        await this.setStateChangedAsync(relativeId, { val: false, ack: true });
        return;
      }
      await this.updateConfigurationFromState(scheduleId, (schedule) => {
        const target = schedule.heatingModes.find((candidate) => candidate.id === modeId);
        if (!target) {
          throw new Error(`Heating mode ${modeId} does not exist on schedule ${scheduleId}`);
        }
        if (field === "weekdaySelection") {
          if (!(0, import_configuration.isWeekdaySelection)(state.val)) {
            throw new Error("Weekday selection must be 0, 1, or 2");
          }
          target.weekdaySelection = state.val;
          return;
        }
        if (field === "startTime") {
          if (typeof state.val !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(state.val)) {
            throw new Error("Start time must use HH:mm");
          }
          target.startTime = state.val;
          return;
        }
        if (field === "startDate") {
          if (typeof state.val !== "string" || state.val !== "" && !(0, import_configuration.isValidCalendarDate)(state.val)) {
            throw new Error("Start date must use YYYY-MM-DD");
          }
          if (state.val === "") {
            delete target.startDate;
          } else {
            target.startDate = state.val;
          }
          return;
        }
        if (field === "endDate") {
          if (typeof state.val !== "string" || state.val !== "" && !(0, import_configuration.isValidCalendarDate)(state.val)) {
            throw new Error("End date must use YYYY-MM-DD");
          }
          if (state.val === "") {
            delete target.endDate;
          } else {
            target.endDate = state.val;
          }
          return;
        }
        if (field === "temperature") {
          const value = this.getFiniteNumber(state.val);
          if (value < 0 || value > 50 || Math.round(value * 10) !== value * 10) {
            throw new Error("Temperature must be between 0 and 50 \xB0C in 0.1 \xB0C steps");
          }
          target.temperature = value;
          return;
        }
        if (field === "priority") {
          target.priority = this.getNonNegativeInteger(state.val);
          return;
        }
        if (field === "weekdays" && parts.length === 6) {
          const weekday = WEEKDAY_NAMES.indexOf(parts[5]) + 1;
          if (weekday < 1 || typeof state.val !== "boolean") {
            throw new Error(`Unknown weekday state ${parts[5]}`);
          }
          target.weekdays = target.weekdays.filter((day) => day !== weekday);
          if (state.val) {
            target.weekdays.push(weekday);
            target.weekdays.sort((left, right) => left - right);
          }
          if (!target.weekdays.length) {
            throw new Error("At least one weekday must remain selected");
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
  resetFeedbackDeviationForSetpoint(stateId) {
    for (const schedule of this.configuration.schedules) {
      for (const mapping of schedule.setpointMappings) {
        if (mapping.setpointStateId === stateId) {
          this.feedbackDeviationCounts.delete(this.feedbackKey(schedule.id, mapping.id));
        }
      }
    }
  }
  async updateConfigurationFromState(scheduleId, update) {
    await this.enqueueConfigurationMutation((current) => {
      const schedule = current.schedules.find((candidate) => candidate.id === scheduleId);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} does not exist`);
      }
      const changedSchedule = structuredClone(schedule);
      update(changedSchedule);
      return {
        result: void 0,
        configuration: (0, import_configuration.normalizeConfiguration)({
          ...current,
          schedules: current.schedules.map(
            (candidate) => candidate.id === scheduleId ? changedSchedule : candidate
          )
        })
      };
    });
  }
  async acknowledgeConfigurationState(relativeId, fallback) {
    const authoritative = this.getConfigurationStateValue(relativeId);
    await this.setStateChangedAsync(relativeId, {
      val: authoritative === void 0 ? fallback : authoritative,
      ack: true
    });
  }
  getConfigurationStateValue(relativeId) {
    var _a;
    const parts = relativeId.split(".");
    if (parts[0] !== "schedules") {
      return void 0;
    }
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === parts[1]);
    if (!schedule) {
      return void 0;
    }
    if (parts.length === 3) {
      switch (parts[2]) {
        case "startDate":
          return schedule.startDate || "";
        case "endDate":
          return schedule.endDate || "";
        case "enabled":
          return void 0;
        default:
          return void 0;
      }
    }
    if (parts[2] === "setpointMappings" && parts.length === 5) {
      const mapping = schedule.setpointMappings.find((candidate) => candidate.id === parts[3]);
      if (!mapping) {
        return void 0;
      }
      switch (parts[4]) {
        case "setpointStateId":
          return mapping.setpointStateId;
        case "feedbackStateId":
          return mapping.feedbackStateId || "";
        case "feedbackMode":
          return mapping.feedbackMode;
        case "feedbackIntervalMinutes":
          return (_a = mapping.feedbackIntervalMinutes) != null ? _a : 0;
        case "deviationCountBeforeWrite":
          return mapping.deviationCountBeforeWrite;
        default:
          return void 0;
      }
    }
    if (parts[2] !== "heatingModes" || parts.length < 5) {
      return void 0;
    }
    const mode = schedule.heatingModes.find((candidate) => candidate.id === parts[3]);
    if (!mode) {
      return void 0;
    }
    if (parts[4] === "weekdays" && parts.length === 6) {
      const weekday = WEEKDAY_NAMES.indexOf(parts[5]) + 1;
      return weekday >= 1 ? mode.weekdays.includes(weekday) : void 0;
    }
    switch (parts[4]) {
      case "weekdaySelection":
        return mode.weekdaySelection;
      case "startTime":
        return mode.startTime;
      case "startDate":
        return mode.startDate || "";
      case "endDate":
        return mode.endDate || "";
      case "temperature":
        return mode.temperature;
      case "priority":
        return mode.priority;
      default:
        return void 0;
    }
  }
  getFiniteNumber(value) {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) {
      throw new Error("Value must be a finite number");
    }
    return number;
  }
  getPositiveNumber(value) {
    const number = this.getFiniteNumber(value);
    if (number <= 0) {
      throw new Error("Value must be greater than zero");
    }
    return number;
  }
  getPositiveInteger(value) {
    const number = this.getFiniteNumber(value);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error("Value must be a positive integer");
    }
    return number;
  }
  getNonNegativeInteger(value) {
    const number = this.getFiniteNumber(value);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error("Value must be a non-negative integer");
    }
    return number;
  }
  async executeHeatingMode(scheduleId, modeId) {
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
    const mode = schedule == null ? void 0 : schedule.heatingModes.find((candidate) => candidate.id === modeId);
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
          `Could not write setpoint mapping ${scheduleId}/${mapping.id} for heating mode ${modeId}: ${String(error)}`
        );
      }
    }
  }
  async executeCurrentHeatingMode(scheduleId) {
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
    if (!schedule) {
      throw new Error(`Heating schedule ${scheduleId} does not exist`);
    }
    const now = /* @__PURE__ */ new Date();
    const weekday = (now.getDay() + 6) % 7 + 1;
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const mode = (0, import_configuration.selectHeatingModeForManualActivation)(schedule, weekday, minutesSinceMidnight);
    if (!mode) {
      this.log.warn(`No matching heating mode found for manual activation of ${scheduleId}`);
      return;
    }
    await this.executeHeatingMode(scheduleId, mode.id);
  }
  async executeEnabledModeMatchingHeatingMode(scheduleId, requireScheduleEnabled) {
    var _a;
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
    if (!schedule) {
      throw new Error(`Heating schedule ${scheduleId} does not exist`);
    }
    if (requireScheduleEnabled && ((_a = await this.getStateAsync(`schedules.${scheduleId}.enabled`)) == null ? void 0 : _a.val) !== true) {
      this.log.debug(`Skipped enabled heating mode application for disabled schedule ${scheduleId}`);
      return;
    }
    const enabledModes = await this.getEnabledHeatingModes(schedule);
    if (!enabledModes.length) {
      this.log.debug(`Skipped enabled-mode matching for ${scheduleId}: no mode is enabled`);
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const weekday = (now.getDay() + 6) % 7 + 1;
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const mode = (0, import_configuration.selectHeatingModeForManualActivation)(
      { heatingModes: enabledModes },
      weekday,
      minutesSinceMidnight,
      false
    );
    if (!mode) {
      this.log.debug(`Skipped enabled heating mode application for ${scheduleId}: no matching mode`);
      return;
    }
    await this.executeHeatingMode(scheduleId, mode.id);
  }
  async getEnabledHeatingModes(schedule) {
    var _a;
    const enabledModes = [];
    for (const mode of schedule.heatingModes) {
      if (((_a = await this.getStateAsync(`schedules.${schedule.id}.heatingModes.${mode.id}.enabled`)) == null ? void 0 : _a.val) === true) {
        enabledModes.push(mode);
      }
    }
    return enabledModes;
  }
  feedbackKey(scheduleId, mappingId) {
    return `${scheduleId}:${mappingId}`;
  }
  async handleFeedbackStateChange(id, state) {
    var _a;
    const feedbackMappings = [];
    for (const schedule of this.configuration.schedules) {
      const mappings = schedule.setpointMappings.filter((mapping) => mapping.feedbackStateId === id);
      if (!mappings.length) {
        continue;
      }
      if (((_a = await this.getStateAsync(`schedules.${schedule.id}.enabled`)) == null ? void 0 : _a.val) !== true) {
        for (const mapping of mappings) {
          this.feedbackDeviationCounts.delete(this.feedbackKey(schedule.id, mapping.id));
        }
        continue;
      }
      feedbackMappings.push(...mappings.map((mapping) => ({ scheduleId: schedule.id, mapping })));
    }
    if (!feedbackMappings.length) {
      return;
    }
    const currentValue = this.asNumericStateValue(state.val);
    if (currentValue === void 0) {
      return;
    }
    const previousValue = this.lastFeedbackValues.get(id);
    const changed = previousValue === void 0 || !this.sameNumber(previousValue, currentValue);
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
  async pollFeedbackStates() {
    for (const stateId of this.monitoredStateSubscriptions) {
      const state = await this.getForeignStateAsync(stateId);
      if (state) {
        await this.handleFeedbackStateChange(stateId, state);
      }
    }
  }
  feedbackUpdateToken(state) {
    return state.ts !== void 0 ? `ts:${state.ts}` : `value:${typeof state.val === "object" ? JSON.stringify(state.val) : String(state.val)}`;
  }
  async checkCyclicFeedback(scheduleId, mappingId) {
    var _a;
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
    const mapping = schedule == null ? void 0 : schedule.setpointMappings.find((candidate) => candidate.id === mappingId);
    if (!(mapping == null ? void 0 : mapping.feedbackStateId) || mapping.feedbackMode !== 2) {
      return;
    }
    if (((_a = await this.getStateAsync(`schedules.${scheduleId}.enabled`)) == null ? void 0 : _a.val) !== true) {
      this.feedbackDeviationCounts.delete(this.feedbackKey(scheduleId, mappingId));
      return;
    }
    const state = await this.getForeignStateAsync(mapping.feedbackStateId);
    const currentValue = this.asNumericStateValue(state == null ? void 0 : state.val);
    if (currentValue === void 0) {
      return;
    }
    this.lastFeedbackValues.set(mapping.feedbackStateId, currentValue);
    await this.evaluateFeedback(scheduleId, mapping, this.feedbackKey(scheduleId, mappingId), currentValue, true);
  }
  async evaluateFeedback(scheduleId, mapping, key, currentValue, countDeviation) {
    const scheduleEnabled = await this.getStateAsync(`schedules.${scheduleId}.enabled`);
    if ((scheduleEnabled == null ? void 0 : scheduleEnabled.val) !== true) {
      this.feedbackDeviationCounts.delete(key);
      return;
    }
    const setpointState = await this.getForeignStateAsync(mapping.setpointStateId);
    const currentSetpoint = this.asNumericStateValue(setpointState == null ? void 0 : setpointState.val);
    if (currentSetpoint === void 0) {
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
      `Feedback deviation for ${key}: received ${currentValue}, current setpoint ${currentSetpoint}, count ${deviationCount}/${mapping.deviationCountBeforeWrite}`
    );
    if (deviationCount < mapping.deviationCountBeforeWrite) {
      this.feedbackDeviationCounts.set(key, deviationCount);
      return;
    }
    this.feedbackDeviationCounts.delete(key);
    await this.writeSetpointForMapping(scheduleId, mapping, currentSetpoint, "feedback deviation");
  }
  async writeSetpointForMapping(scheduleId, mapping, value, reason) {
    var _a, _b;
    const setpointObject = await this.getForeignObjectAsync(mapping.setpointStateId);
    if ((setpointObject == null ? void 0 : setpointObject.type) !== "state" || ((_a = setpointObject.common) == null ? void 0 : _a.type) !== "number") {
      throw new Error(`Setpoint state ${mapping.setpointStateId} does not exist or is not a number state`);
    }
    if (mapping.feedbackStateId) {
      const feedbackObject = await this.getForeignObjectAsync(mapping.feedbackStateId);
      if ((feedbackObject == null ? void 0 : feedbackObject.type) !== "state" || ((_b = feedbackObject.common) == null ? void 0 : _b.type) !== "number") {
        throw new Error(`Feedback state ${mapping.feedbackStateId} does not exist or is not a number state`);
      }
    }
    await this.setForeignStateAsync(mapping.setpointStateId, { val: value, ack: false });
    this.log.debug(`Wrote ${value} to ${mapping.setpointStateId} (${reason})`);
  }
  asNumericStateValue(value) {
    if (value === void 0 || value === null || value === "") {
      return void 0;
    }
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : void 0;
  }
  sameNumber(left, right) {
    return Math.abs(left - right) < 1e-4;
  }
  async evaluateSchedules() {
    const now = /* @__PURE__ */ new Date();
    const date = this.localDate();
    const weekday = (now.getDay() + 6) % 7 + 1;
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    await this.applyDateActivationTransitions(date);
    for (const schedule of this.configuration.schedules) {
      const scheduleEnabled = await this.getStateAsync(`schedules.${schedule.id}.enabled`);
      if ((scheduleEnabled == null ? void 0 : scheduleEnabled.val) !== true) {
        this.lastAppliedModes.delete(schedule.id);
        continue;
      }
      const enabledModes = await this.getEnabledHeatingModes(schedule);
      const mode = (0, import_configuration.selectHeatingModeForManualActivation)(
        { heatingModes: enabledModes },
        weekday,
        minutesSinceMidnight,
        true
      );
      if (!mode) {
        this.lastAppliedModes.delete(schedule.id);
        continue;
      }
      const executionKey = `${date}:${mode.id}`;
      if (this.lastAppliedModes.get(schedule.id) === executionKey) {
        continue;
      }
      await this.executeHeatingMode(schedule.id, mode.id);
      this.lastAppliedModes.set(schedule.id, executionKey);
    }
  }
  scheduleConfigurationBackup() {
    var _a;
    if (this.configurationBackupTimer) {
      this.clearTimeout(this.configurationBackupTimer);
      this.configurationBackupTimer = void 0;
    }
    const delayMinutes = Number((_a = this.config.configurationBackupDelayMinutes) != null ? _a : 60);
    if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
      return;
    }
    this.configurationBackupTimer = this.setTimeout(
      () => {
        this.configurationBackupTimer = void 0;
        this.trackEventOperation("schedule configuration backup", async () => {
          try {
            await this.backupScheduleConfiguration();
          } catch (error) {
            this.log.error(`Could not back up schedule configuration: ${String(error)}`);
          }
        });
      },
      Math.min(delayMinutes, 35791) * 6e4
    );
  }
  async backupScheduleConfiguration() {
    await this.configurationQueue;
    const schedulesFolder = await this.getObjectAsync("schedules");
    if (!(schedulesFolder == null ? void 0 : schedulesFolder.native)) {
      throw new Error("The schedules folder does not exist");
    }
    const instanceId = `system.adapter.${this.namespace}`;
    const instanceObject = await this.getForeignObjectAsync(instanceId);
    if (!instanceObject) {
      throw new Error(`The instance object ${instanceId} does not exist`);
    }
    const native = (0, import_configuration.normalizeConfiguration)(schedulesFolder.native);
    const instanceNative = instanceObject.native || {};
    if (!(0, import_configuration_backup.configurationBackupNeedsUpdate)(native, instanceNative.scheduleConfigurationBackup)) {
      return false;
    }
    instanceObject.native = {
      ...instanceNative,
      scheduleConfigurationBackup: structuredClone(native)
    };
    await this.setForeignObjectAsync(instanceId, instanceObject);
    this.log.info("Updated the schedule configuration backup in the instance object");
    return true;
  }
  async restoreScheduleConfigurationBackup(rebuild) {
    var _a;
    await this.configurationQueue;
    const instanceId = `system.adapter.${this.namespace}`;
    const instanceObject = await this.getForeignObjectAsync(instanceId);
    const backup = (0, import_configuration_backup.getRestorableConfigurationBackup)((_a = instanceObject == null ? void 0 : instanceObject.native) == null ? void 0 : _a.scheduleConfigurationBackup);
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
  async onMessage(message) {
    if (this.unloading) {
      return;
    }
    if (message.command !== "backupScheduleConfiguration" && message.command !== "restoreScheduleConfiguration") {
      return;
    }
    try {
      const changed = message.command === "backupScheduleConfiguration" ? await this.backupScheduleConfiguration() : await this.restoreScheduleConfigurationBackup(true);
      this.sendTo(
        message.from,
        message.command,
        {
          result: message.command === "backupScheduleConfiguration" ? changed ? "backupUpdated" : "backupCurrent" : changed ? "backupRestored" : "backupMissing"
        },
        message.callback
      );
    } catch (error) {
      this.sendTo(message.from, message.command, { error: String(error) }, message.callback);
    }
  }
  onUnload(callback) {
    this.unloading = true;
    if (this.configurationBackupTimer) {
      this.clearTimeout(this.configurationBackupTimer);
      this.configurationBackupTimer = void 0;
    }
    if (this.scheduleTimer) {
      this.clearInterval(this.scheduleTimer);
      this.scheduleTimer = void 0;
    }
    if (this.feedbackPollTimer) {
      this.clearInterval(this.feedbackPollTimer);
      this.feedbackPollTimer = void 0;
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
    const finish = () => {
      if (callbackCalled) {
        return;
      }
      callbackCalled = true;
      callback();
    };
    const timeout = this.setTimeout(finish, 5e3);
    void Promise.allSettled(pending).then(() => {
      this.clearTimeout(timeout);
      finish();
    });
  }
  trackEventOperation(operation, task) {
    if (this.unloading) {
      return;
    }
    let promise;
    try {
      promise = task();
    } catch (error) {
      this.log.error(`${operation} failed: ${String(error)}`);
      return;
    }
    this.pendingOperations.add(promise);
    void promise.catch((error) => {
      if (!this.unloading) {
        this.log.error(`${operation} failed: ${String(error)}`);
      }
    }).finally(() => this.pendingOperations.delete(promise));
  }
}
if (require.main !== module) {
  module.exports = (options) => new HeatingScheduler(options);
} else {
  (() => new HeatingScheduler())();
}
//# sourceMappingURL=main.js.map
