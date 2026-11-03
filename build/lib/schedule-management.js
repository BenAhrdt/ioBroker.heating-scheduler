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
var schedule_management_exports = {};
__export(schedule_management_exports, {
  HeatingSchedulerManagement: () => HeatingSchedulerManagement
});
module.exports = __toCommonJS(schedule_management_exports);
var import_dm_utils = require("@iobroker/dm-utils");
var import_configuration = require("./configuration");
function translate(en, de) {
  return { en, de };
}
function temperatureButtonText(temperature) {
  const value = Number.isInteger(temperature) ? String(temperature) : temperature.toFixed(1);
  return translate(`${value} \xB0C`, `${value.replace(".", ",")} \xB0C`);
}
function getName(data) {
  return typeof (data == null ? void 0 : data.name) === "string" ? data.name.trim() : "";
}
function getHeatingType(data) {
  return (data == null ? void 0 : data.heatingType) === "underfloorHeating" ? "underfloorHeating" : import_configuration.DEFAULT_HEATING_TYPE;
}
function heatingTypePresentation(type) {
  const radiatorIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M10 16v32M18 16v32M26 16v32M38 16v32M46 16v32M54 16v32"/><path d="M8 16h48M8 48h48M6 12h52M6 52h52"/></g></svg>`;
  const underfloorIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M10 18h40a6 6 0 0 1 0 12H20a6 6 0 0 0 0 12h30a6 6 0 0 1 0 12H10" fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="5"/><path d="M18 10v6M32 8v8M46 10v6" fill="none" stroke="white" stroke-linecap="round" stroke-width="4"/></svg>`;
  return type === "underfloorHeating" ? { backgroundColor: "#0f766e", icon: `data:image/svg+xml,${encodeURIComponent(underfloorIcon)}` } : { backgroundColor: "#b45309", icon: `data:image/svg+xml,${encodeURIComponent(radiatorIcon)}` };
}
function getTextValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const candidate = value;
    for (const key of ["value", "id", "name", "label"]) {
      if (typeof candidate[key] === "string" && candidate[key].trim()) {
        return candidate[key].trim();
      }
    }
  }
  return "";
}
function normalizeDatePickerValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = getTextValue(value);
  if (!text || (0, import_configuration.isValidCalendarDate)(text)) {
    return text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
function normalizeHeatingModeFormRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }
    const mode = candidate;
    return {
      ...mode,
      startDate: mode.useStartDate === true ? normalizeDatePickerValue(mode.startDate) : "",
      endDate: mode.useEndDate === true ? normalizeDatePickerValue(mode.endDate) : ""
    };
  });
}
function datePickerActivationControl(dateAttr, useAttr, en, de, newLine = false) {
  return {
    type: "checkbox",
    attr: useAttr,
    label: translate(en, de),
    default: false,
    onChange: {
      alsoDependsOn: [],
      calculateFunc: `if (!data.${useAttr}) data.${dateAttr} = ''; return data.${useAttr};`
    },
    newLine,
    xs: 12,
    sm: 6,
    md: 2,
    lg: 2,
    xl: 2
  };
}
function numericStateValidator(field, optional) {
  const optionalCheck = optional ? "if (!value) return true;" : "if (!value) return false;";
  return `return (() => { const value = typeof data.${field} === 'string' ? data.${field}.trim() : (data.${field} && typeof data.${field} === 'object' ? String(data.${field}.value || data.${field}.id || '').trim() : ''); ${optionalCheck} const ids = typeof globalData !== 'undefined' && Array.isArray(globalData._validNumericStateIds) ? globalData._validNumericStateIds : (Array.isArray(data._validNumericStateIds) ? data._validNumericStateIds : []); return ids.includes(value); })()`;
}
function numericStateConfigurationDisabledRule(validNumericStateIds) {
  return `(() => { const ids = ${JSON.stringify(validNumericStateIds)}; const text = value => value instanceof Date ? value.toISOString() : typeof value === 'string' ? value.trim() : (value && typeof value === 'object' ? String(value.value || value.id || '').trim() : ''); const date = value => { const raw = text(value); if (!raw) return ''; const parsed = new Date(raw); if (Number.isNaN(parsed.getTime())) return null; const normalized = raw.length === 10 && raw[4] === '-' && raw[7] === '-' ? raw : String(parsed.getFullYear()).padStart(4, '0') + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0'); return /^\\d{4}-\\d{2}-\\d{2}$/.test(normalized) && new Date(normalized + 'T00:00:00Z').toISOString().slice(0, 10) === normalized ? normalized : null; }; const range = (start, end) => !start || !end || start <= end; const mappings = Array.isArray(data.setpointMappings) ? data.setpointMappings : []; const modes = Array.isArray(data.heatingModes) ? data.heatingModes : []; const scheduleStart = date(data.startDate); const scheduleEnd = date(data.endDate); return mappings.some(mapping => { const setpoint = text(mapping && mapping.setpointStateId); const feedback = text(mapping && mapping.feedbackStateId); return !ids.includes(setpoint) || (feedback !== '' && !ids.includes(feedback)); }) || scheduleStart === null || scheduleEnd === null || !range(scheduleStart, scheduleEnd) || modes.some(mode => { const temperature = Number(mode && mode.temperature); const start = date(mode && mode.startDate); const end = date(mode && mode.endDate); return !String(mode && mode.name || '').trim() || !Array.isArray(mode && mode.weekdays) || !mode.weekdays.length || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(mode && mode.startTime || '')) || start === null || end === null || !range(start, end) || !Number.isFinite(temperature) || temperature < 0 || temperature > 50 || Math.round(temperature * 10) !== temperature * 10; }); })()`;
}
function mappingDisplayName(mapping, allMappings, numericStateNames) {
  const baseName = numericStateNames[mapping.setpointStateId] || mapping.setpointStateId || "Setpoint mapping";
  const hasDuplicateName = allMappings.filter(
    (candidate) => (numericStateNames[candidate.setpointStateId] || candidate.setpointStateId) === baseName
  ).length > 1;
  return hasDuplicateName ? `${baseName} (${mapping.setpointStateId})` : baseName;
}
function mappingValueLabel(en, de, position, multiple) {
  const suffix = multiple ? ` ${position}` : "";
  return translate(`${en}${suffix}`, `${de}${suffix}`);
}
const WEEKDAY_ABBREVIATIONS = [
  { en: "Mon", de: "Mo" },
  { en: "Tue", de: "Di" },
  { en: "Wed", de: "Mi" },
  { en: "Thu", de: "Do" },
  { en: "Fri", de: "Fr" },
  { en: "Sat", de: "Sa" },
  { en: "Sun", de: "So" }
];
function formatDisplayDate(value, language, compact = false) {
  const [year, month, day] = value.split("-");
  return compact ? language === "de" ? `${day}.${month}.` : `${month}/${day}` : language === "de" ? `${day}.${month}.${year}` : `${month}/${day}/${year}`;
}
function activationDateText(startDate, endDate, compact = false) {
  if (!startDate && !endDate) {
    return void 0;
  }
  const en = [];
  const de = [];
  if (startDate) {
    en.push(`Auto on ${formatDisplayDate(startDate, "en", compact)}`);
    de.push(`Auto ein ${formatDisplayDate(startDate, "de", compact)}`);
  }
  if (endDate) {
    en.push(`Auto off ${formatDisplayDate(endDate, "en", compact)}`);
    de.push(`Auto aus ${formatDisplayDate(endDate, "de", compact)}`);
  }
  return { en: en.join(" \xB7 "), de: de.join(" \xB7 ") };
}
function formatWeekdayRanges(days, language) {
  const sortedDays = [...new Set(days)].filter((day) => day >= 1 && day <= 7).sort((left, right) => left - right);
  const ranges = [];
  for (let index = 0; index < sortedDays.length; index += 1) {
    const start = sortedDays[index];
    let end = start;
    while (sortedDays[index + 1] === end + 1) {
      end = sortedDays[++index];
    }
    ranges.push(
      start === end ? WEEKDAY_ABBREVIATIONS[start - 1][language] : `${WEEKDAY_ABBREVIATIONS[start - 1][language]}\u2013${WEEKDAY_ABBREVIATIONS[end - 1][language]}`
    );
  }
  return ranges.join(", ");
}
function heatingModeScheduleText(mode) {
  const selectedDays = formatWeekdayRanges(mode.weekdays, "de");
  const selectedDaysEn = formatWeekdayRanges(mode.weekdays, "en");
  const weekdays = mode.weekdaySelection === 0 ? { en: "All days", de: "Alle Tage" } : mode.weekdaySelection === 2 ? { en: `Except ${selectedDaysEn}`, de: `Au\xDFer ${selectedDays}` } : { en: selectedDaysEn, de: selectedDays };
  const dateText = activationDateText(mode.startDate, mode.endDate, true);
  const baseText = {
    en: `${weekdays.en} \xB7 ${mode.startTime}`,
    de: `${weekdays.de} \xB7 ${mode.startTime}`
  };
  return {
    en: dateText ? `${baseText.en}
${dateText.en}` : baseText.en,
    de: dateText ? `${baseText.de}
${dateText.de}` : baseText.de
  };
}
function scheduleNameValidator(existingNames) {
  return `return (() => { const name = typeof data.name === 'string' ? data.name.trim() : ''; if (!name) return false; const existingNames = ${JSON.stringify(existingNames)}; return !existingNames.some(existing => existing.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0); })()`;
}
function scheduleNameDisabledRule(existingNames) {
  return `(() => { const name = typeof data.name === 'string' ? data.name.trim() : ''; const existingNames = ${JSON.stringify(existingNames)}; return !name || existingNames.some(existing => existing.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0); })()`;
}
function mappingNameOnChange() {
  return {
    alsoDependsOn: [],
    calculateFunc: `return (async () => { const selectedId = typeof data.setpointStateId === 'string' ? data.setpointStateId.trim() : ''; if (!selectedId) { data.name = ''; return data.setpointStateId; } const object = await getObject(selectedId); const rawName = object && object.common ? object.common.name : undefined; const stateName = rawName && typeof rawName === 'object' ? rawName.de || rawName.en || selectedId : typeof rawName === 'string' && rawName.trim() ? rawName.trim() : selectedId; data.name = stateName; return data.setpointStateId; })()`
  };
}
function scheduleForm(existingNames = []) {
  return {
    type: "panel",
    items: {
      name: {
        type: "text",
        label: translate("Schedule name", "Name des Heizplans"),
        help: translate(
          "The schedule name can change without changing the technical schedule ID.",
          "Der Name des Heizplans kann ge\xE4ndert werden, ohne die technische Heizplan-ID zu \xE4ndern."
        ),
        validator: scheduleNameValidator(existingNames),
        validatorErrorText: translate(
          "Enter a unique, non-empty schedule name.",
          "Bitte einen eindeutigen, nicht leeren Heizplannamen eingeben."
        ),
        validatorNoSaveOnError: true,
        newLine: true,
        xs: 12,
        sm: 12,
        md: 12,
        lg: 12,
        xl: 12
      }
    }
  };
}
function scheduleConfigurationForm() {
  return {
    type: "tabs",
    tabsStyle: { minWidth: 850 },
    items: {
      heatingSystem: {
        type: "panel",
        label: translate("Heating system", "Heizsystem"),
        items: {
          heatingType: {
            type: "select",
            attr: "heatingType",
            label: translate("Heating system", "Heizsystem"),
            options: [
              {
                value: "radiator",
                label: translate("Radiator", "Heizk\xF6rper")
              },
              {
                value: "underfloorHeating",
                label: translate("Underfloor heating", "Fu\xDFbodenheizung")
              }
            ],
            default: import_configuration.DEFAULT_HEATING_TYPE,
            newLine: true,
            xs: 12,
            sm: 8,
            md: 6,
            lg: 6,
            xl: 6
          },
          useStartDate: datePickerActivationControl(
            "startDate",
            "useStartDate",
            "Enable start date",
            "Startdatum aktivieren",
            true
          ),
          startDate: {
            type: "datePicker",
            attr: "startDate",
            hidden: "data.useStartDate !== true",
            label: translate("Start date (optional)", "Startdatum (optional)"),
            help: translate(
              "Start the heating schedule on this date when it is not active.",
              "Heizplan an diesem Datum aktivieren, wenn er nicht aktiv ist."
            ),
            default: "",
            newLine: false,
            xs: 12,
            sm: 6,
            md: 4,
            lg: 4,
            xl: 4
          },
          useEndDate: datePickerActivationControl(
            "endDate",
            "useEndDate",
            "Enable end date",
            "Enddatum aktivieren"
          ),
          endDate: {
            type: "datePicker",
            attr: "endDate",
            hidden: "data.useEndDate !== true",
            label: translate("End date (optional)", "Enddatum (optional)"),
            help: translate(
              "Deactivate the heating schedule on this date when it is active.",
              "Heizplan an diesem Datum deaktivieren, wenn er aktiv ist."
            ),
            default: "",
            newLine: false,
            xs: 12,
            sm: 6,
            md: 4,
            lg: 4,
            xl: 4
          }
        }
      },
      setpointMappings: {
        type: "panel",
        label: translate("Setpoint / feedback mappings", "Sollwert-/R\xFCckmelde-Zuordnungen"),
        items: {
          setpointMappings: {
            type: "accordion",
            titleAttr: "name",
            items: [
              { type: "text", attr: "id", hidden: true },
              {
                type: "objectId",
                attr: "setpointStateId",
                label: translate("Sollwert state ID", "Sollwert-State-ID"),
                customFilter: { type: "state", common: { type: "number" } },
                onChange: mappingNameOnChange(),
                validator: numericStateValidator("setpointStateId", false),
                validatorErrorText: translate(
                  "Please select an existing number state.",
                  "Bitte einen vorhandenen State vom Typ number ausw\xE4hlen."
                ),
                validatorNoSaveOnError: true,
                help: translate(
                  "The future write logic will write only this state for this mapping.",
                  "Die sp\xE4tere Schreiblogik schreibt f\xFCr diese Zuordnung nur diesen State."
                ),
                newLine: true,
                xs: 12,
                sm: 12,
                md: 8,
                lg: 8,
                xl: 8
              },
              {
                type: "objectId",
                attr: "feedbackStateId",
                label: translate("Optional feedback state ID", "Optionale R\xFCckmelde-State-ID"),
                customFilter: { type: "state", common: { type: "number" } },
                validator: numericStateValidator("feedbackStateId", true),
                validatorErrorText: translate(
                  "Please select an existing number state or leave it empty.",
                  "Bitte einen vorhandenen State vom Typ number ausw\xE4hlen oder leer lassen."
                ),
                validatorNoSaveOnError: true,
                newLine: true,
                xs: 12,
                sm: 12,
                md: 8,
                lg: 8,
                xl: 8
              },
              {
                type: "select",
                attr: "feedbackMode",
                label: translate("Feedback mode", "R\xFCckmeldeart"),
                default: 1,
                options: [
                  { value: 0, label: translate("On change", "Bei \xC4nderung") },
                  { value: 1, label: translate("On update", "Bei Aktualisierung") },
                  { value: 2, label: translate("Cyclic", "Zyklisch") }
                ],
                newLine: true,
                xs: 12,
                sm: 6,
                md: 6,
                lg: 6,
                xl: 6
              },
              {
                type: "number",
                attr: "feedbackIntervalMinutes",
                label: translate("Cyclic interval in minutes", "Zyklisches Intervall in Minuten"),
                min: 1,
                step: 1,
                default: 5,
                hidden: "data.feedbackMode !== 2",
                newLine: false,
                xs: 12,
                sm: 6,
                md: 6,
                lg: 6,
                xl: 6
              },
              {
                type: "number",
                attr: "deviationCountBeforeWrite",
                label: translate(
                  "Deviations before a future write",
                  "Abweichungen bis zum erneuten Schreiben"
                ),
                min: 1,
                step: 1,
                default: 3,
                newLine: true,
                xs: 12,
                sm: 6,
                md: 6,
                lg: 6,
                xl: 6
              }
            ]
          }
        }
      },
      heatingModes: {
        type: "panel",
        label: translate("Heating modes", "Heizmodi"),
        items: {
          heatingModes: {
            type: "accordion",
            titleAttr: "name",
            clone: "id",
            items: [
              { type: "text", attr: "id", hidden: true },
              {
                type: "text",
                attr: "name",
                label: translate("Heating mode name", "Name des Heizmodus"),
                validator: "return typeof data.name === 'string' && data.name.trim() !== ''",
                validatorErrorText: translate(
                  "Please enter a name for the heating mode.",
                  "Bitte einen Namen f\xFCr den Heizmodus eingeben."
                ),
                validatorNoSaveOnError: true,
                newLine: true,
                xs: 12,
                sm: 12,
                md: 8,
                lg: 8,
                xl: 8
              },
              {
                type: "select",
                attr: "weekdays",
                label: translate("Weekdays", "Wochentage"),
                default: [1, 2, 3, 4, 5, 6, 7],
                multiple: true,
                options: [
                  { value: 1, label: translate("Monday", "Montag") },
                  { value: 2, label: translate("Tuesday", "Dienstag") },
                  { value: 3, label: translate("Wednesday", "Mittwoch") },
                  { value: 4, label: translate("Thursday", "Donnerstag") },
                  { value: 5, label: translate("Friday", "Freitag") },
                  { value: 6, label: translate("Saturday", "Samstag") },
                  { value: 7, label: translate("Sunday", "Sonntag") }
                ],
                newLine: true,
                xs: 12,
                sm: 8,
                md: 8,
                lg: 8,
                xl: 8
              },
              {
                type: "select",
                attr: "weekdaySelection",
                label: translate("Weekday selection", "Wochentagauswahl"),
                default: 1,
                options: [
                  {
                    value: 0,
                    label: translate("All weekdays", "Alle Wochentage")
                  },
                  {
                    value: 1,
                    label: translate("Include selected days", "Ausgew\xE4hlte Tage einschlie\xDFen")
                  },
                  {
                    value: 2,
                    label: translate("Exclude selected days", "Ausgew\xE4hlte Tage ausschlie\xDFen")
                  }
                ],
                newLine: true,
                xs: 12,
                sm: 8,
                md: 8,
                lg: 8,
                xl: 8
              },
              datePickerActivationControl(
                "startDate",
                "useStartDate",
                "Enable start date",
                "Startdatum aktivieren",
                true
              ),
              {
                type: "datePicker",
                attr: "startDate",
                hidden: "data.useStartDate !== true",
                label: translate("Start date (optional)", "Startdatum (optional)"),
                help: translate(
                  "Activate this heating mode on this date when it is not active.",
                  "Heizmodus an diesem Datum aktivieren, wenn er nicht aktiv ist."
                ),
                default: "",
                newLine: false,
                xs: 12,
                sm: 6,
                md: 4,
                lg: 4,
                xl: 4
              },
              datePickerActivationControl(
                "endDate",
                "useEndDate",
                "Enable end date",
                "Enddatum aktivieren"
              ),
              {
                type: "datePicker",
                attr: "endDate",
                hidden: "data.useEndDate !== true",
                label: translate("End date (optional)", "Enddatum (optional)"),
                help: translate(
                  "Deactivate this heating mode on this date when it is active.",
                  "Heizmodus an diesem Datum deaktivieren, wenn er aktiv ist."
                ),
                default: "",
                newLine: false,
                xs: 12,
                sm: 6,
                md: 4,
                lg: 4,
                xl: 4
              },
              {
                type: "timePicker",
                attr: "startTime",
                format: "HH:mm",
                views: ["hours", "minutes"],
                label: translate("Time", "Zeit"),
                default: "00:00",
                newLine: true,
                xs: 12,
                sm: 6,
                md: 4,
                lg: 4,
                xl: 4
              },
              {
                type: "number",
                attr: "temperature",
                label: translate("Temperature", "Temperatur"),
                unit: "\xB0C",
                min: 0,
                max: 50,
                default: 20,
                step: 0.1,
                validator: "return (() => { const value = Number(data.temperature); return Number.isFinite(value) && value >= 0 && value <= 50 && Math.round(value * 10) === value * 10; })()",
                validatorErrorText: translate(
                  "Enter a temperature between 0 and 50 \xB0C in 0.1 \xB0C steps.",
                  "Bitte eine Temperatur zwischen 0 und 50 \xB0C in 0,1-\xB0C-Schritten eingeben."
                ),
                validatorNoSaveOnError: true,
                newLine: false,
                style: {
                  display: "flex",
                  alignItems: "flex-end"
                },
                xs: 12,
                sm: 6,
                md: 4,
                lg: 4,
                xl: 4
              }
            ]
          }
        }
      }
    }
  };
}
function scheduleConfigurationData(schedule, numericStateNames) {
  var _a, _b;
  return {
    _validNumericStateIds: Object.keys(numericStateNames),
    heatingType: schedule.heatingType,
    setpointMappings: schedule.setpointMappings.map((mapping) => ({
      ...mapping,
      name: mappingDisplayName(mapping, schedule.setpointMappings, numericStateNames)
    })),
    heatingModes: schedule.heatingModes.map((mode) => ({
      ...mode,
      weekdays: [...mode.weekdays],
      useStartDate: mode.startDate !== void 0,
      useEndDate: mode.endDate !== void 0
    })),
    startDate: (_a = schedule.startDate) != null ? _a : "",
    endDate: (_b = schedule.endDate) != null ? _b : "",
    useStartDate: schedule.startDate !== void 0,
    useEndDate: schedule.endDate !== void 0
  };
}
function normalizeMappingFormRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }
    const mapping = candidate;
    return {
      ...mapping,
      setpointStateId: getTextValue(mapping.setpointStateId),
      feedbackStateId: getTextValue(mapping.feedbackStateId)
    };
  });
}
class HeatingSchedulerManagement extends import_dm_utils.DeviceManagement {
  /**
   * Creates the Device Manager bridge.
   *
   * @param adapter adapter host
   */
  constructor(adapter) {
    super(adapter, true);
  }
  /** Keeps the Device Manager action cache usable before the GUI requests a device reload. */
  refreshDeviceCache() {
    const devices = /* @__PURE__ */ new Map();
    for (const schedule of this.adapter.getHeatingSchedules()) {
      devices.set(JSON.stringify(schedule.id), this.deviceInfo(schedule));
    }
    this.devices = devices;
  }
  safeActionHandler(actionId, handler) {
    return async (...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`Device Manager action ${actionId} failed: ${message}`);
        return { error: { code: 500, message } };
      }
    };
  }
  getInstanceInfo() {
    return {
      apiVersion: "v3",
      communicationStateId: "info.deviceManager",
      actions: [
        {
          id: "addSchedule",
          icon: "add",
          title: translate("Add schedule", "Heizplan hinzuf\xFCgen"),
          variant: "contained",
          style: { backgroundColor: "#455a64", color: "#fff" },
          timeout: 12e4,
          handler: this.safeActionHandler("addSchedule", async (context) => {
            const existingNames = this.adapter.getHeatingSchedules().map((schedule) => schedule.name);
            const data = await context.showForm(scheduleForm(existingNames), {
              title: translate("Add schedule", "Heizplan hinzuf\xFCgen"),
              data: { name: "" },
              buttons: ["apply", "cancel"],
              applyDisabledRule: scheduleNameDisabledRule(existingNames)
            });
            if (!data) {
              return { refresh: "none" };
            }
            const scheduleId = await this.adapter.addHeatingSchedule(getName(data));
            this.refreshDeviceCache();
            return this.refreshDeviceInGui(scheduleId);
          })
        }
      ]
    };
  }
  loadDevices(context) {
    const schedules = this.adapter.getHeatingSchedules();
    context.setTotalDevices(schedules.length);
    for (const schedule of schedules) {
      context.addDevice(this.deviceInfo(schedule));
    }
  }
  getDeviceInfo(deviceId) {
    const schedule = this.adapter.getHeatingSchedules().find((candidate) => candidate.id === deviceId);
    if (!schedule) {
      throw new Error(`Heating schedule ${deviceId} not found`);
    }
    return this.deviceInfo(schedule);
  }
  deviceInfo(schedule) {
    const configureHandler = this.safeActionHandler(
      "configureSchedule",
      async (_id, context) => {
        const numericStateNames = await this.adapter.getNumericStateNames();
        const formOptions = {
          title: translate("Configure heating schedule", "Heizplan konfigurieren"),
          dialogName: `heating-schedule-${schedule.id}`,
          data: scheduleConfigurationData(schedule, numericStateNames),
          buttons: ["apply", "cancel"],
          ignoreApplyDisabled: true,
          applyDisabledRule: numericStateConfigurationDisabledRule(Object.keys(numericStateNames))
        };
        const data = await context.showForm(scheduleConfigurationForm(), formOptions);
        if (!data) {
          return { refresh: "none" };
        }
        await this.adapter.updateHeatingSchedule(schedule.id, {
          name: schedule.name,
          heatingType: getHeatingType(data),
          startDate: data.useStartDate === true ? normalizeDatePickerValue(data.startDate) : "",
          endDate: data.useEndDate === true ? normalizeDatePickerValue(data.endDate) : "",
          setpointMappings: normalizeMappingFormRows(data.setpointMappings),
          heatingModes: normalizeHeatingModeFormRows(data.heatingModes)
        });
        this.refreshDeviceCache();
        return this.refreshDeviceInGui(schedule.id);
      }
    );
    const renameHandler = this.safeActionHandler(
      "renameSchedule",
      async (_id, context) => {
        const existingNames = this.adapter.getHeatingSchedules().filter((candidate) => candidate.id !== schedule.id).map((candidate) => candidate.name);
        const data = await context.showForm(scheduleForm(existingNames), {
          title: translate("Rename schedule", "Heizplan umbenennen"),
          data: { name: schedule.name },
          buttons: ["apply", "cancel"],
          applyDisabledRule: scheduleNameDisabledRule(existingNames)
        });
        if (!data) {
          return { refresh: "none" };
        }
        await this.adapter.renameHeatingSchedule(schedule.id, getName(data));
        this.refreshDeviceCache();
        return this.refreshDeviceInGui(schedule.id);
      }
    );
    const enableDisableHandler = this.safeActionHandler(import_dm_utils.ACTIONS.ENABLE_DISABLE, async () => {
      const stateId = `schedules.${schedule.id}.active`;
      const state = await this.adapter.getStateAsync(stateId);
      await this.adapter.setStateAsync(stateId, { val: (state == null ? void 0 : state.val) !== true, ack: false });
      return { refresh: "none" };
    });
    const info = {
      id: schedule.id,
      name: schedule.name,
      ...heatingTypePresentation(schedule.heatingType),
      color: "#fff",
      actions: [
        {
          id: import_dm_utils.ACTIONS.ENABLE_DISABLE,
          description: translate(
            "Enable or disable the heating schedule",
            "Heizplan aktivieren oder deaktivieren"
          ),
          handler: enableDisableHandler
        },
        {
          id: "configureSchedule",
          icon: "settings",
          description: translate("Configure heating schedule", "Heizplan konfigurieren"),
          timeout: 12e4,
          handler: configureHandler
        },
        {
          id: "renameSchedule",
          icon: "edit",
          description: translate("Rename schedule", "Heizplan umbenennen"),
          timeout: 12e4,
          handler: renameHandler
        },
        {
          id: "deleteSchedule",
          icon: "delete",
          color: "secondary",
          description: translate("Delete schedule", "Heizplan l\xF6schen"),
          confirmation: translate("Delete this schedule?", "Diesen Heizplan l\xF6schen?"),
          timeout: 12e4,
          handler: this.safeActionHandler("deleteSchedule", async () => {
            await this.adapter.removeHeatingSchedule(schedule.id);
            this.refreshDeviceCache();
            await this.sendCommandToGui({ command: "delete", deviceId: schedule.id });
            return { refresh: "devices" };
          })
        }
      ]
    };
    const modeControls = {
      scheduleActiveLabel: {
        type: "staticText",
        text: translate("Heating schedule active", "Heizplan aktiv"),
        style: {
          marginTop: -48,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          fontSize: "1rem"
        },
        newLine: true,
        xs: 8,
        sm: 8
      },
      scheduleActive: {
        type: "state",
        oid: `schedules.${schedule.id}.active`,
        control: "switch",
        tooltip: translate("Enable or disable the heating schedule", "Heizplan aktivieren oder deaktivieren"),
        style: {
          marginTop: -48,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          transform: "scale(0.75)",
          transformOrigin: "right center"
        },
        newLine: false,
        xs: 4,
        sm: 4
      },
      ...schedule.startDate || schedule.endDate ? {
        scheduleActivationDates: {
          type: "staticText",
          text: activationDateText(schedule.startDate, schedule.endDate),
          size: "small",
          style: {
            color: "text.secondary",
            fontSize: "0.72rem",
            marginTop: -8,
            marginBottom: 4,
            paddingLeft: 4
          },
          newLine: true,
          xs: 12
        }
      } : {},
      ...schedule.heatingModes.length ? {
        scheduleActivate: {
          type: "state",
          oid: `schedules.${schedule.id}.activate`,
          control: "button",
          buttonValue: true,
          falseText: translate("Set matching setpoint", "Passenden Sollwert setzen"),
          falseTextStyle: {
            display: "flex",
            width: "150px",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: "0.75rem",
            whiteSpace: "nowrap"
          },
          icon: "play",
          variant: "outlined",
          tooltip: translate(
            "Set the setpoint of the most recent heating mode for the current time",
            "Sollwert des letzten passenden Heizmodus f\xFCr die aktuelle Zeit setzen"
          ),
          style: {
            marginTop: 8,
            marginBottom: 8,
            display: "flex",
            justifyContent: "center",
            marginLeft: "auto",
            marginRight: "auto",
            "& button": {
              width: "180px",
              minWidth: "180px",
              height: "36px",
              boxSizing: "border-box",
              padding: "3px 10px",
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              alignItems: "center",
              textAlign: "center",
              justifyContent: "center"
            }
          },
          newLine: true,
          xs: 12
        },
        scheduleActivateActive: {
          type: "state",
          oid: `schedules.${schedule.id}.activateActive`,
          control: "button",
          buttonValue: true,
          falseText: translate("Set active setpoint", "Aktiven Sollwert setzen"),
          falseTextStyle: {
            display: "flex",
            width: "150px",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: "0.75rem",
            whiteSpace: "nowrap"
          },
          icon: "play",
          variant: "outlined",
          tooltip: translate(
            "Set the setpoint of the heating mode currently selected by automation",
            "Sollwert des aktuell von der Automatik ausgew\xE4hlten Heizmodus setzen"
          ),
          dependsOnStates: {
            scheduleActive: `.schedules.${schedule.id}.active`,
            ...Object.fromEntries(
              schedule.heatingModes.map((mode, index) => [
                `modeActive${index}`,
                `.schedules.${schedule.id}.heatingModes.${mode.id}.active`
              ])
            )
          },
          hidden: `!_states.scheduleActive?.val || !(${schedule.heatingModes.map((_mode, index) => `_states.modeActive${index}?.val === true`).join(" || ")})`,
          style: {
            marginTop: 4,
            marginBottom: 8,
            display: "flex",
            justifyContent: "center",
            marginLeft: "auto",
            marginRight: "auto",
            "& button": {
              width: "180px",
              minWidth: "180px",
              height: "36px",
              boxSizing: "border-box",
              padding: "3px 10px",
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              alignItems: "center",
              textAlign: "center",
              justifyContent: "center"
            }
          },
          newLine: true,
          xs: 12
        }
      } : {},
      ...Object.fromEntries(
        schedule.setpointMappings.flatMap((mapping) => {
          const controls = [
            [
              `currentSetpoint_${mapping.id}`,
              {
                type: "state",
                oid: mapping.setpointStateId,
                foreign: true,
                control: "number",
                label: mappingValueLabel(
                  "Current setpoint",
                  "Aktueller Sollwert",
                  schedule.setpointMappings.indexOf(mapping) + 1,
                  schedule.setpointMappings.length > 1
                ),
                unit: "\xB0C",
                digits: 1,
                readOnly: true,
                style: { marginTop: -2, marginBottom: -2 },
                newLine: true,
                xs: 12
              }
            ]
          ];
          if (mapping.feedbackStateId) {
            controls.push([
              `currentFeedback_${mapping.id}`,
              {
                type: "state",
                oid: mapping.feedbackStateId,
                foreign: true,
                control: "number",
                label: mappingValueLabel(
                  "Reported setpoint",
                  "R\xFCckgemeldeter Sollwert",
                  schedule.setpointMappings.indexOf(mapping) + 1,
                  schedule.setpointMappings.length > 1
                ),
                unit: "\xB0C",
                digits: 1,
                readOnly: true,
                style: { marginTop: -2, marginBottom: -2 },
                newLine: true,
                xs: 12
              }
            ]);
          }
          return controls;
        })
      ),
      scheduleModesHeader: {
        type: "header",
        text: translate("Modes", "Modi"),
        size: 5,
        style: {
          marginTop: 10,
          marginLeft: -4,
          width: "calc(100% + 4px)",
          marginBottom: 8,
          "& h5": {
            backgroundColor: "secondary.main",
            color: "secondary.contrastText"
          }
        },
        newLine: true,
        xs: 12
      },
      ...Object.fromEntries(
        schedule.heatingModes.flatMap((mode) => [
          [
            `modeRow_${mode.id}`,
            {
              type: "panel",
              items: {
                [`label_${mode.id}`]: {
                  type: "staticText",
                  text: mode.name,
                  style: {
                    marginTop: 0,
                    marginBottom: -2,
                    display: "flex",
                    alignItems: "center",
                    whiteSpace: "nowrap"
                  },
                  newLine: true,
                  xs: 8,
                  sm: 8
                },
                [`active_${mode.id}`]: {
                  type: "state",
                  oid: `schedules.${schedule.id}.heatingModes.${mode.id}.active`,
                  control: "switch",
                  tooltip: translate(
                    "Enable or disable this heating mode",
                    "Diesen Heizmodus aktivieren oder deaktivieren"
                  ),
                  style: {
                    marginTop: 0,
                    marginBottom: -2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    position: "relative",
                    left: "38px",
                    transform: "scale(0.75)",
                    transformOrigin: "right center"
                  },
                  newLine: false,
                  xs: 4,
                  sm: 4
                }
              },
              innerStyle: {
                alignContent: "flex-start",
                justifyContent: "flex-start",
                rowGap: 0
              },
              style: {
                margin: 0,
                padding: 0,
                width: "100%"
              },
              newLine: true,
              xs: 8,
              sm: 8
            }
          ],
          [
            `activate_${mode.id}`,
            {
              type: "state",
              oid: `schedules.${schedule.id}.heatingModes.${mode.id}.activate`,
              control: "button",
              buttonValue: true,
              falseText: temperatureButtonText(mode.temperature),
              falseTextStyle: {
                display: "flex",
                width: "55px",
                minWidth: "55px",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: "0.75rem",
                whiteSpace: "nowrap"
              },
              icon: "play",
              variant: "outlined",
              tooltip: translate("Apply this heating mode now", "Diesen Heizmodus jetzt anwenden"),
              style: {
                marginTop: 0,
                marginBottom: -2,
                display: "flex",
                justifyContent: "flex-end",
                paddingRight: 0,
                "& button": {
                  width: "55px",
                  minWidth: "55px",
                  boxSizing: "border-box",
                  padding: "2px 4px",
                  fontSize: "0.75rem",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                  justifyContent: "center",
                  transform: "scale(0.8)",
                  transformOrigin: "right center"
                }
              },
              newLine: false,
              xs: 4,
              sm: 4
            }
          ],
          [
            `info_${mode.id}`,
            {
              type: "staticText",
              text: heatingModeScheduleText(mode),
              size: "small",
              style: {
                color: "text.secondary",
                fontSize: "0.7rem",
                lineHeight: 1.25,
                whiteSpace: "pre-line",
                marginTop: -4,
                marginBottom: 2,
                paddingLeft: 4
              },
              newLine: true,
              xs: 12
            }
          ]
        ])
      )
    };
    info.customInfo = {
      id: `heatingModes_${schedule.id}`,
      schema: {
        type: "panel",
        innerStyle: {
          alignContent: "flex-start",
          justifyContent: "flex-start",
          rowGap: 0
        },
        items: modeControls
      }
    };
    return info;
  }
  async refreshDeviceInGui(scheduleId) {
    const schedule = this.adapter.getHeatingSchedules().find((candidate) => candidate.id === scheduleId);
    if (!schedule) {
      return { refresh: "devices" };
    }
    this.refreshDeviceCache();
    await this.sendCommandToGui({ command: "infoUpdate", deviceId: schedule.id });
    return { refresh: "devices" };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HeatingSchedulerManagement
});
//# sourceMappingURL=schedule-management.js.map
