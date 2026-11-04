"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schedule_operations_exports = {};
__export(schedule_operations_exports, {
  addScheduleToConfiguration: () => addScheduleToConfiguration,
  removeScheduleFromConfiguration: () => removeScheduleFromConfiguration,
  renameScheduleInConfiguration: () => renameScheduleInConfiguration,
  updateScheduleConfiguration: () => updateScheduleConfiguration
});
module.exports = __toCommonJS(schedule_operations_exports);
var import_configuration = require("./configuration");
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validateConfigurationPatch(patch) {
  if (patch.heatingType !== void 0 && !(0, import_configuration.isHeatingType)(patch.heatingType)) {
    throw new Error("The heating system type is invalid");
  }
  if (!Array.isArray(patch.setpointMappings) || !Array.isArray(patch.heatingModes)) {
    throw new Error("The schedule configuration collections must be arrays");
  }
  if (patch.startDate !== void 0 && patch.startDate !== "" && !(0, import_configuration.isValidCalendarDate)(patch.startDate)) {
    throw new Error("The schedule start date must use YYYY-MM-DD");
  }
  if (patch.endDate !== void 0 && patch.endDate !== "" && !(0, import_configuration.isValidCalendarDate)(patch.endDate)) {
    throw new Error("The schedule end date must use YYYY-MM-DD");
  }
  for (const [index, candidate] of patch.setpointMappings.entries()) {
    if (!isRecord(candidate)) {
      throw new Error(`Setpoint mapping ${index + 1} is invalid`);
    }
    if (typeof candidate.setpointStateId !== "string" || !candidate.setpointStateId.trim()) {
      throw new Error(`Setpoint mapping ${index + 1} needs a Sollwert state ID`);
    }
    if (candidate.feedbackStateId !== void 0 && typeof candidate.feedbackStateId !== "string") {
      throw new Error(`Setpoint mapping ${index + 1} has an invalid feedback state ID`);
    }
    const feedbackMode = candidate.feedbackMode === void 0 || candidate.feedbackMode === "" ? import_configuration.DEFAULT_FEEDBACK_MODE : candidate.feedbackMode;
    if (!(0, import_configuration.isFeedbackMode)(feedbackMode)) {
      throw new Error(`Setpoint mapping ${index + 1} has an invalid feedback mode`);
    }
    if (feedbackMode === 2 && (typeof candidate.feedbackIntervalMinutes !== "number" || !Number.isFinite(candidate.feedbackIntervalMinutes) || candidate.feedbackIntervalMinutes <= 0)) {
      throw new Error(`Setpoint mapping ${index + 1} needs a positive cyclic interval`);
    }
    if (candidate.deviationCountBeforeWrite !== void 0 && (typeof candidate.deviationCountBeforeWrite !== "number" || !Number.isSafeInteger(candidate.deviationCountBeforeWrite) || candidate.deviationCountBeforeWrite < 1)) {
      throw new Error(`Setpoint mapping ${index + 1} needs a positive deviation count`);
    }
  }
  for (const [index, candidate] of patch.heatingModes.entries()) {
    if (!isRecord(candidate)) {
      throw new Error(`Heating mode ${index + 1} is invalid`);
    }
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      throw new Error(`Heating mode ${index + 1} needs a name`);
    }
    if (!Array.isArray(candidate.weekdays) || !candidate.weekdays.length) {
      throw new Error(`Heating mode ${index + 1} needs at least one weekday`);
    }
    if (!candidate.weekdays.every((day) => Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 7)) {
      throw new Error(`Heating mode ${index + 1} contains an invalid weekday`);
    }
    if (!(0, import_configuration.isWeekdaySelection)(candidate.weekdaySelection)) {
      throw new Error(`Heating mode ${index + 1} has an invalid weekday selection`);
    }
    if (typeof candidate.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.startTime)) {
      throw new Error(`Heating mode ${index + 1} needs a valid HH:mm start time`);
    }
    if (candidate.startDate !== void 0 && candidate.startDate !== "" && !(0, import_configuration.isValidCalendarDate)(candidate.startDate)) {
      throw new Error(`Heating mode ${index + 1} needs a valid YYYY-MM-DD start date`);
    }
    if (candidate.endDate !== void 0 && candidate.endDate !== "" && !(0, import_configuration.isValidCalendarDate)(candidate.endDate)) {
      throw new Error(`Heating mode ${index + 1} needs a valid YYYY-MM-DD end date`);
    }
    if (typeof candidate.temperature !== "number" || !Number.isFinite(candidate.temperature)) {
      throw new Error(`Heating mode ${index + 1} needs a finite temperature`);
    }
  }
}
function validateName(configuration, name, currentId) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    throw new Error("The schedule display name must not be empty");
  }
  const duplicate = configuration.schedules.find(
    (schedule) => schedule.id !== currentId && schedule.name.localeCompare(normalizedName, void 0, { sensitivity: "accent" }) === 0
  );
  if (duplicate) {
    throw new Error(`The schedule name is already used by ${duplicate.id}`);
  }
  return normalizedName;
}
function addScheduleToConfiguration(configuration, name, heatingType = import_configuration.DEFAULT_HEATING_TYPE) {
  const normalizedName = validateName(configuration, name);
  if (!(0, import_configuration.isHeatingType)(heatingType)) {
    throw new Error("The heating system type is invalid");
  }
  const created = (0, import_configuration.createScheduleId)(
    configuration.nextScheduleNumber,
    new Set(configuration.schedules.map((schedule) => schedule.id))
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
          nextHeatingModeNumber: 1
        }
      ],
      nextScheduleNumber: created.nextScheduleNumber
    }
  };
}
function renameScheduleInConfiguration(configuration, id, name, heatingType) {
  if (!configuration.schedules.some((schedule) => schedule.id === id)) {
    throw new Error(`Schedule ${id} does not exist`);
  }
  const normalizedName = validateName(configuration, name, id);
  if (heatingType !== void 0 && !(0, import_configuration.isHeatingType)(heatingType)) {
    throw new Error("The heating system type is invalid");
  }
  return {
    ...configuration,
    schedules: configuration.schedules.map(
      (schedule) => schedule.id === id ? { ...schedule, name: normalizedName, ...heatingType ? { heatingType } : {} } : schedule
    )
  };
}
function removeScheduleFromConfiguration(configuration, id) {
  if (!configuration.schedules.some((schedule) => schedule.id === id)) {
    throw new Error(`Schedule ${id} does not exist`);
  }
  return {
    ...configuration,
    schedules: configuration.schedules.filter((schedule) => schedule.id !== id)
  };
}
function updateScheduleConfiguration(configuration, id, patch, validNumericStateIds) {
  const schedule = configuration.schedules.find((entry) => entry.id === id);
  if (!schedule) {
    throw new Error(`Schedule ${id} does not exist`);
  }
  validateConfigurationPatch(patch);
  if (validNumericStateIds) {
    for (const [index, candidate] of patch.setpointMappings.entries()) {
      const setpointStateId = typeof candidate === "object" && candidate ? candidate.setpointStateId : void 0;
      const feedbackStateId = typeof candidate === "object" && candidate ? candidate.feedbackStateId : void 0;
      if (typeof setpointStateId !== "string" || !validNumericStateIds.has(setpointStateId.trim())) {
        throw new Error(`Setpoint mapping ${index + 1} must use an existing number Sollwert state`);
      }
      if (typeof feedbackStateId === "string" && feedbackStateId.trim() && !validNumericStateIds.has(feedbackStateId.trim())) {
        throw new Error(`Setpoint mapping ${index + 1} must use an existing number feedback state`);
      }
    }
  }
  const normalizedName = validateName(configuration, patch.name, id);
  const existingMappingIds = new Set(schedule.setpointMappings.map((mapping) => mapping.id));
  const usedMappingIds = new Set(existingMappingIds);
  let nextMappingNumber = schedule.nextSetpointMappingNumber;
  const setpointMappings = patch.setpointMappings.map((candidate) => {
    const record = candidate;
    const candidateId = typeof record.id === "string" ? record.id.trim() : "";
    if (candidateId && existingMappingIds.has(candidateId)) {
      const existing = schedule.setpointMappings.find((mapping) => mapping.id === candidateId);
      if (!existing) {
        throw new Error(`Setpoint mapping ${candidateId} does not exist`);
      }
      return {
        ...record,
        id: existing.id,
        setpointStateId: record.setpointStateId.trim(),
        ...typeof record.feedbackStateId === "string" && record.feedbackStateId.trim() ? { feedbackStateId: record.feedbackStateId.trim() } : {}
      };
    }
    const created = (0, import_configuration.createChildId)("mapping", nextMappingNumber, usedMappingIds);
    usedMappingIds.add(created.id);
    nextMappingNumber = created.nextNumber;
    return {
      ...record,
      id: created.id
    };
  });
  const existingModeIds = new Set(schedule.heatingModes.map((mode) => mode.id));
  const heatingModes = patch.heatingModes.map((candidate) => {
    const record = candidate;
    const candidateId = typeof record.id === "string" ? record.id.trim() : "";
    return candidateId && existingModeIds.has(candidateId) ? { ...record, id: candidateId } : { ...record, id: void 0 };
  });
  return (0, import_configuration.normalizeConfiguration)({
    ...configuration,
    schedules: configuration.schedules.map(
      (entry) => {
        var _a;
        return entry.id === id ? {
          ...entry,
          name: normalizedName,
          heatingType: (_a = patch.heatingType) != null ? _a : entry.heatingType,
          startDate: patch.startDate !== void 0 ? patch.startDate || void 0 : entry.startDate,
          endDate: patch.endDate !== void 0 ? patch.endDate || void 0 : entry.endDate,
          setpointMappings,
          nextSetpointMappingNumber: nextMappingNumber,
          heatingModes
        } : entry;
      }
    )
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addScheduleToConfiguration,
  removeScheduleFromConfiguration,
  renameScheduleInConfiguration,
  updateScheduleConfiguration
});
//# sourceMappingURL=schedule-operations.js.map
