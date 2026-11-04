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
var configuration_exports = {};
__export(configuration_exports, {
  CURRENT_SCHEMA_VERSION: () => CURRENT_SCHEMA_VERSION,
  DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES: () => DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES,
  DEFAULT_DEVIATION_COUNT_BEFORE_WRITE: () => DEFAULT_DEVIATION_COUNT_BEFORE_WRITE,
  DEFAULT_FEEDBACK_MODE: () => DEFAULT_FEEDBACK_MODE,
  DEFAULT_HEATING_MODE_START_TIME: () => DEFAULT_HEATING_MODE_START_TIME,
  DEFAULT_HEATING_MODE_TEMPERATURE: () => DEFAULT_HEATING_MODE_TEMPERATURE,
  DEFAULT_HEATING_MODE_WEEKDAYS: () => DEFAULT_HEATING_MODE_WEEKDAYS,
  DEFAULT_HEATING_TYPE: () => DEFAULT_HEATING_TYPE,
  DEFAULT_WEEKDAY_SELECTION: () => DEFAULT_WEEKDAY_SELECTION,
  createChildId: () => createChildId,
  createScheduleId: () => createScheduleId,
  isDateInActivationRange: () => isDateInActivationRange,
  isEmptyConfiguration: () => isEmptyConfiguration,
  isFeedbackMode: () => isFeedbackMode,
  isHeatingType: () => isHeatingType,
  isValidCalendarDate: () => isValidCalendarDate,
  isValidDateRange: () => isValidDateRange,
  isWeekdaySelection: () => isWeekdaySelection,
  migrateConfiguration: () => migrateConfiguration,
  normalizeConfiguration: () => normalizeConfiguration,
  selectHeatingModeForManualActivation: () => selectHeatingModeForManualActivation,
  validateConfiguration: () => validateConfiguration
});
module.exports = __toCommonJS(configuration_exports);
const CURRENT_SCHEMA_VERSION = 3;
const DEFAULT_FEEDBACK_MODE = 1;
const DEFAULT_WEEKDAY_SELECTION = 1;
const DEFAULT_HEATING_TYPE = "radiator";
const DEFAULT_DEVIATION_COUNT_BEFORE_WRITE = 3;
const DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES = 5;
const DEFAULT_HEATING_MODE_START_TIME = "00:00";
const DEFAULT_HEATING_MODE_TEMPERATURE = 20;
const DEFAULT_HEATING_MODE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
function isFeedbackMode(value) {
  return value === 0 || value === 1 || value === 2;
}
function isWeekdaySelection(value) {
  return value === 0 || value === 1 || value === 2;
}
function isHeatingType(value) {
  return value === "radiator" || value === "underfloorHeating";
}
function heatingModeMatchesWeekday(mode, weekday) {
  return mode.weekdaySelection === 0 ? true : mode.weekdaySelection === 1 ? mode.weekdays.includes(weekday) : !mode.weekdays.includes(weekday);
}
function heatingModeStartMinutes(mode) {
  const [hours, minutes] = mode.startTime.split(":").map(Number);
  return hours * 60 + minutes;
}
function selectHeatingModeForManualActivation(schedule, weekday, minutesSinceMidnight, includePreviousWeekdays = true) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(minutesSinceMidnight) || minutesSinceMidnight < 0 || minutesSinceMidnight >= 24 * 60) {
    return void 0;
  }
  let selected;
  for (let daysAgo = 0; daysAgo < (includePreviousWeekdays ? 7 : 1); daysAgo += 1) {
    const occurrenceWeekday = (weekday - 1 - daysAgo + 7) % 7 + 1;
    for (const mode of schedule.heatingModes) {
      if (!heatingModeMatchesWeekday(mode, occurrenceWeekday)) {
        continue;
      }
      const startMinutes = heatingModeStartMinutes(mode);
      if (daysAgo === 0 && startMinutes > minutesSinceMidnight) {
        continue;
      }
      const elapsedMinutes = daysAgo * 24 * 60 + minutesSinceMidnight - startMinutes;
      if (!selected || elapsedMinutes < selected.elapsedMinutes) {
        selected = { mode, elapsedMinutes };
      }
    }
  }
  return selected == null ? void 0 : selected.mode;
}
const SCHEDULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CHILD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function positiveInteger(value, fallback) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function finiteNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
function positiveNumber(value, fallback) {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}
function normalizeFeedbackMode(value) {
  if (isFeedbackMode(value)) {
    return value;
  }
  if (value === "onChange") {
    return 0;
  }
  if (value === "cyclic") {
    return 2;
  }
  return DEFAULT_FEEDBACK_MODE;
}
function normalizeWeekdaySelection(value) {
  if (isWeekdaySelection(value)) {
    return value;
  }
  if (value === "exclude") {
    return 2;
  }
  if (value === "include") {
    return 1;
  }
  return DEFAULT_WEEKDAY_SELECTION;
}
function normalizeHeatingType(value) {
  return isHeatingType(value) ? value : DEFAULT_HEATING_TYPE;
}
function normalizeDate(value) {
  const date = asTrimmedString(value);
  if (!DATE_PATTERN.test(date)) {
    return void 0;
  }
  const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? void 0 : date;
}
function isValidCalendarDate(value) {
  return normalizeDate(value) !== void 0;
}
function isValidDateRange(startDate, endDate) {
  return (!startDate || isValidCalendarDate(startDate)) && (!endDate || isValidCalendarDate(endDate));
}
function isDateInActivationRange(date, startDate, endDate, defaultEnabled = true) {
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
function normalizeWeekdays(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_HEATING_MODE_WEEKDAYS];
  }
  const weekdays = value.map((day) => typeof day === "string" && day.trim() ? Number(day) : day).filter((day) => typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7);
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_HEATING_MODE_WEEKDAYS];
}
function nextChildId(prefix, nextNumber, usedIds) {
  let number = positiveInteger(nextNumber, 1);
  let id = `${prefix}_${String(number).padStart(3, "0")}`;
  while (usedIds.has(id)) {
    number += 1;
    id = `${prefix}_${String(number).padStart(3, "0")}`;
  }
  return { id, nextNumber: number + 1 };
}
function normalizeChildId(value, prefix, nextNumber, usedIds) {
  const configuredId = asTrimmedString(value);
  if (configuredId && CHILD_ID_PATTERN.test(configuredId) && !usedIds.has(configuredId)) {
    const generatedNumber = new RegExp(`^${prefix}_(\\d+)$`).exec(configuredId);
    return {
      id: configuredId,
      nextNumber: generatedNumber ? Math.max(nextNumber, Number(generatedNumber[1]) + 1) : nextNumber
    };
  }
  return nextChildId(prefix, nextNumber, usedIds);
}
function normalizeSetpointMappings(value, configuredNextNumber) {
  const items = [];
  const usedIds = /* @__PURE__ */ new Set();
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
    const generated = normalizeChildId(candidate.id, "mapping", nextNumber, usedIds);
    usedIds.add(generated.id);
    nextNumber = generated.nextNumber;
    const feedbackMode = normalizeFeedbackMode(candidate.feedbackMode);
    const feedbackStateId = asTrimmedString(candidate.feedbackStateId);
    items.push({
      id: generated.id,
      setpointStateId,
      ...feedbackStateId ? { feedbackStateId } : {},
      feedbackMode,
      ...feedbackMode === 2 ? {
        feedbackIntervalMinutes: positiveNumber(
          candidate.feedbackIntervalMinutes,
          DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES
        )
      } : {},
      deviationCountBeforeWrite: positiveInteger(
        candidate.deviationCountBeforeWrite,
        DEFAULT_DEVIATION_COUNT_BEFORE_WRITE
      )
    });
  }
  return { items, nextNumber };
}
function normalizeHeatingModes(value, configuredNextNumber) {
  const items = [];
  const usedIds = /* @__PURE__ */ new Set();
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
    const generated = normalizeChildId(candidate.id, "mode", nextNumber, usedIds);
    usedIds.add(generated.id);
    nextNumber = generated.nextNumber;
    const startTime = asTrimmedString(candidate.startTime);
    items.push({
      id: generated.id,
      name,
      weekdays: normalizeWeekdays(candidate.weekdays),
      weekdaySelection: normalizeWeekdaySelection(candidate.weekdaySelection),
      startTime: TIME_PATTERN.test(startTime) ? startTime : DEFAULT_HEATING_MODE_START_TIME,
      ...normalizeDate(candidate.startDate) ? { startDate: normalizeDate(candidate.startDate) } : {},
      ...normalizeDate(candidate.endDate) ? { endDate: normalizeDate(candidate.endDate) } : {},
      temperature: finiteNumber(candidate.temperature, DEFAULT_HEATING_MODE_TEMPERATURE)
    });
  }
  return { items, nextNumber };
}
function normalizeSchedule(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const id = asTrimmedString(value.id);
  const name = asTrimmedString(value.name);
  if (!id || !SCHEDULE_ID_PATTERN.test(id) || !name) {
    return void 0;
  }
  const mappings = normalizeSetpointMappings(value.setpointMappings, value.nextSetpointMappingNumber);
  const modes = normalizeHeatingModes(value.heatingModes, value.nextHeatingModeNumber);
  return {
    id,
    name,
    heatingType: normalizeHeatingType(value.heatingType),
    ...normalizeDate(value.startDate) ? { startDate: normalizeDate(value.startDate) } : {},
    ...normalizeDate(value.endDate) ? { endDate: normalizeDate(value.endDate) } : {},
    setpointMappings: mappings.items,
    heatingModes: modes.items,
    nextSetpointMappingNumber: mappings.nextNumber,
    nextHeatingModeNumber: modes.nextNumber
  };
}
function emptyConfiguration() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    schedules: [],
    nextScheduleNumber: 1
  };
}
function migrateConfiguration(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const version = value.schemaVersion;
  if (version === CURRENT_SCHEMA_VERSION) {
    return { ...value };
  }
  if (version === void 0 || version === 1 || version === 2) {
    const schedules = Array.isArray(value.schedules) ? value.schedules.map(
      (schedule) => {
        var _a, _b;
        return isRecord(schedule) ? {
          ...schedule,
          setpointMappings: Array.isArray(schedule.setpointMappings) ? schedule.setpointMappings : [],
          heatingModes: Array.isArray(schedule.heatingModes) ? schedule.heatingModes : [],
          nextSetpointMappingNumber: (_a = schedule.nextSetpointMappingNumber) != null ? _a : 1,
          nextHeatingModeNumber: (_b = schedule.nextHeatingModeNumber) != null ? _b : 1
        } : schedule;
      }
    ) : [];
    return {
      ...value,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      schedules
    };
  }
  return void 0;
}
function validateConfiguration(value) {
  const errors = [];
  if (!isRecord(value)) {
    return ["Configuration must be an object."];
  }
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion: ${String(value.schemaVersion)}.`);
  }
  if (!Array.isArray(value.schedules)) {
    errors.push("schedules must be an array.");
  } else {
    const ids = /* @__PURE__ */ new Set();
    const names = /* @__PURE__ */ new Set();
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
      if (schedule.heatingType !== void 0 && !isHeatingType(schedule.heatingType)) {
        errors.push(`schedules[${index}].heatingType is invalid.`);
      }
      if (schedule.startDate !== void 0 && !isValidCalendarDate(schedule.startDate)) {
        errors.push(`schedules[${index}].startDate is invalid.`);
      }
      if (schedule.endDate !== void 0 && !isValidCalendarDate(schedule.endDate)) {
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
            if (mode.startDate !== void 0 && !isValidCalendarDate(mode.startDate)) {
              errors.push(`schedules[${index}].heatingModes[${modeIndex}].startDate is invalid.`);
            }
            if (mode.endDate !== void 0 && !isValidCalendarDate(mode.endDate)) {
              errors.push(`schedules[${index}].heatingModes[${modeIndex}].endDate is invalid.`);
            }
          }
        }
      }
    }
  }
  if (!Number.isSafeInteger(value.nextScheduleNumber) || Number(value.nextScheduleNumber) < 1) {
    errors.push("nextScheduleNumber must be a positive safe integer.");
  }
  return errors;
}
function normalizeConfiguration(value) {
  const migrated = migrateConfiguration(value);
  if (!migrated) {
    return emptyConfiguration();
  }
  const schedules = [];
  const usedIds = /* @__PURE__ */ new Set();
  const usedNames = /* @__PURE__ */ new Set();
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
    nextScheduleNumber: Math.max(configuredNext, largestGeneratedNumber + 1, 1)
  };
}
function isEmptyConfiguration(configuration) {
  return configuration.schedules.length === 0;
}
function createScheduleId(_nextScheduleNumber, usedIds) {
  let number = 1;
  let id = `schedule_${String(number).padStart(3, "0")}`;
  while (usedIds.has(id)) {
    number += 1;
    id = `schedule_${String(number).padStart(3, "0")}`;
  }
  return { id, nextScheduleNumber: number + 1 };
}
function createChildId(prefix, nextNumber, usedIds) {
  return nextChildId(prefix, nextNumber, usedIds);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CYCLIC_FEEDBACK_INTERVAL_MINUTES,
  DEFAULT_DEVIATION_COUNT_BEFORE_WRITE,
  DEFAULT_FEEDBACK_MODE,
  DEFAULT_HEATING_MODE_START_TIME,
  DEFAULT_HEATING_MODE_TEMPERATURE,
  DEFAULT_HEATING_MODE_WEEKDAYS,
  DEFAULT_HEATING_TYPE,
  DEFAULT_WEEKDAY_SELECTION,
  createChildId,
  createScheduleId,
  isDateInActivationRange,
  isEmptyConfiguration,
  isFeedbackMode,
  isHeatingType,
  isValidCalendarDate,
  isValidDateRange,
  isWeekdaySelection,
  migrateConfiguration,
  normalizeConfiguration,
  selectHeatingModeForManualActivation,
  validateConfiguration
});
//# sourceMappingURL=configuration.js.map
