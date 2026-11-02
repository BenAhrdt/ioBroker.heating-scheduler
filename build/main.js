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
  lastScheduleExecutions = /* @__PURE__ */ new Map();
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
    return this.enqueueConfigurationMutation((current) => ({
      result: void 0,
      configuration: (0, import_schedule_operations.updateScheduleConfiguration)(current, id, patch, validNumericStateIds)
    }));
  }
  enqueueConfigurationMutation(mutation) {
    let result;
    const operation = this.configurationQueue.then(async () => {
      const changed = mutation(this.configuration);
      result = changed.result;
      await this.persistConfiguration(changed.configuration);
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
  async persistConfiguration(next) {
    const previous = this.configuration;
    if (next) {
      this.configuration = (0, import_configuration.normalizeConfiguration)(next);
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
  async synchronizeScheduleObjects(previous, next) {
    const nextIds = new Set(next.schedules.map((schedule) => schedule.id));
    for (const schedule of previous.schedules) {
      if (!nextIds.has(schedule.id)) {
        await this.delObjectAsync(`schedules.${schedule.id}`, { recursive: true });
      }
    }
    for (const schedule of next.schedules) {
      await this.setObjectAsync(`schedules.${schedule.id}`, {
        // ioBroker has no schedule object type; Device Manager schedules are
        // represented as valid device objects below the schedules folder.
        type: "device",
        common: { name: schedule.name },
        native: {}
      });
      await this.delObjectAsync(`schedules.${schedule.id}.name`);
      await this.ensureRuntimeState(
        `schedules.${schedule.id}.active`,
        {
          name: { en: "Heating schedule active", de: "Heizplan aktiv" },
          type: "boolean",
          role: "switch",
          read: true,
          write: true
        },
        true
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
          name: { en: "Deviations before write", de: "Abweichungen bis zum Schreiben" },
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
    var _a;
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
          name: { en: "Earliest schedule date", de: "Fr\xFChestes Datum des Heizplans" },
          type: "string",
          role: "date.start",
          read: true,
          write: true
        },
        (_a = mode.startDate) != null ? _a : ""
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
      await this.ensureRuntimeState(
        `${modeBase}.active`,
        {
          name: { en: "Active", de: "Aktiv" },
          type: "boolean",
          role: "switch",
          read: true,
          write: true
        },
        true
      );
      await this.ensureRuntimeState(
        `${modeBase}.activate`,
        {
          name: { en: "Activate now", de: "Jetzt aktivieren" },
          type: "boolean",
          role: "button",
          read: false,
          write: true
        },
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
  async ensureRuntimeState(id, common, defaultValue) {
    await this.setObjectAsync(id, { type: "state", common, native: {} });
    if (!await this.getStateAsync(id)) {
      await this.setStateChangedAsync(id, { val: defaultValue, ack: true });
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
    const parts = relativeId.split(".");
    if (parts[0] !== "schedules") {
      return;
    }
    try {
      const scheduleId = parts[1];
      if (parts.length === 3 && parts[2] === "active") {
        if (typeof state.val !== "boolean") {
          throw new Error("The schedule active state must be boolean");
        }
        await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
        return;
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
      if (field === "active" && parts.length === 5) {
        if (typeof state.val !== "boolean") {
          throw new Error("The heating-mode active state must be boolean");
        }
        await this.setStateChangedAsync(relativeId, { val: state.val, ack: true });
        return;
      }
      if (field === "activate" && parts.length === 5) {
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
          if (typeof state.val !== "string" || state.val !== "" && !this.isValidDate(state.val)) {
            throw new Error("Start date must use YYYY-MM-DD");
          }
          if (state.val === "") {
            delete target.startDate;
          } else {
            target.startDate = state.val;
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
      case "temperature":
        return mode.temperature;
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
  isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
  feedbackKey(scheduleId, mappingId) {
    return `${scheduleId}:${mappingId}`;
  }
  async handleFeedbackStateChange(id, state) {
    const feedbackMappings = this.configuration.schedules.flatMap(
      (schedule) => schedule.setpointMappings.filter((mapping) => mapping.feedbackStateId === id).map((mapping) => ({ scheduleId: schedule.id, mapping }))
    );
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
    const schedule = this.configuration.schedules.find((candidate) => candidate.id === scheduleId);
    const mapping = schedule == null ? void 0 : schedule.setpointMappings.find((candidate) => candidate.id === mappingId);
    if (!(mapping == null ? void 0 : mapping.feedbackStateId) || mapping.feedbackMode !== 2) {
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
    const scheduleActive = await this.getStateAsync(`schedules.${scheduleId}.active`);
    if ((scheduleActive == null ? void 0 : scheduleActive.val) !== true) {
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
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const weekday = (now.getDay() + 6) % 7 + 1;
    for (const schedule of this.configuration.schedules) {
      const scheduleActive = await this.getStateAsync(`schedules.${schedule.id}.active`);
      if ((scheduleActive == null ? void 0 : scheduleActive.val) !== true) {
        continue;
      }
      for (const mode of schedule.heatingModes) {
        const modeActive = await this.getStateAsync(`schedules.${schedule.id}.heatingModes.${mode.id}.active`);
        if ((modeActive == null ? void 0 : modeActive.val) !== true || mode.startDate && date < mode.startDate) {
          continue;
        }
        const weekdayMatches = mode.weekdaySelection === 0 ? true : mode.weekdaySelection === 1 ? mode.weekdays.includes(weekday) : !mode.weekdays.includes(weekday);
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
    const timeout = setTimeout(finish, 5e3);
    void Promise.allSettled(pending).then(() => {
      clearTimeout(timeout);
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
