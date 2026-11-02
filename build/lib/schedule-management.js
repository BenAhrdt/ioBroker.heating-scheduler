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
function numericStateValidator(field, optional) {
  const optionalCheck = optional ? "if (!value) return true;" : "if (!value) return false;";
  return `return (() => { const value = typeof data.${field} === 'string' ? data.${field}.trim() : (data.${field} && typeof data.${field} === 'object' ? String(data.${field}.value || data.${field}.id || '').trim() : ''); ${optionalCheck} const ids = typeof globalData !== 'undefined' && Array.isArray(globalData._validNumericStateIds) ? globalData._validNumericStateIds : (Array.isArray(data._validNumericStateIds) ? data._validNumericStateIds : []); return ids.includes(value); })()`;
}
function numericStateConfigurationDisabledRule(validNumericStateIds) {
  return `(() => { const ids = ${JSON.stringify(validNumericStateIds)}; const text = value => typeof value === 'string' ? value.trim() : (value && typeof value === 'object' ? String(value.value || value.id || '').trim() : ''); const mappings = Array.isArray(data.setpointMappings) ? data.setpointMappings : []; const modes = Array.isArray(data.heatingModes) ? data.heatingModes : []; return mappings.some(mapping => { const setpoint = text(mapping && mapping.setpointStateId); const feedback = text(mapping && mapping.feedbackStateId); return !ids.includes(setpoint) || (feedback !== '' && !ids.includes(feedback)); }) || modes.some(mode => { const temperature = Number(mode && mode.temperature); return !String(mode && mode.name || '').trim() || !Array.isArray(mode && mode.weekdays) || !mode.weekdays.length || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(mode && mode.startTime || '')) || !Number.isFinite(temperature) || temperature < 0 || temperature > 50 || Math.round(temperature * 10) !== temperature * 10; }); })()`;
}
function mappingDisplayName(mapping, allMappings, numericStateNames) {
  const baseName = numericStateNames[mapping.setpointStateId] || mapping.setpointStateId || "Setpoint mapping";
  return allMappings.length > 1 ? `${baseName} (${mapping.id})` : baseName;
}
function mappingValueLabel(en, de, mapping, allMappings) {
  const suffix = allMappings.length > 1 ? ` (${mapping.id})` : "";
  return translate(`${en}${suffix}`, `${de}${suffix}`);
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
    calculateFunc: `return (async () => { const selectedId = typeof data.setpointStateId === 'string' ? data.setpointStateId.trim() : ''; if (!selectedId) { data.name = ''; return data.setpointStateId; } const object = await getObject(selectedId); const rawName = object && object.common ? object.common.name : undefined; const stateName = rawName && typeof rawName === 'object' ? rawName.de || rawName.en || selectedId : typeof rawName === 'string' && rawName.trim() ? rawName.trim() : selectedId; const mappings = globalData && Array.isArray(globalData.setpointMappings) ? globalData.setpointMappings : []; data.name = mappings.length > 1 && data.id ? stateName + ' (' + data.id + ')' : stateName; return data.setpointStateId; })()`
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
      setpointMappings: {
        type: "panel",
        label: translate("Setpoint / feedback mappings", "Sollwert-/R\xFCckmelde-Zuordnungen"),
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
                  "Abweichungen bis zum sp\xE4teren Schreiben"
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
              {
                type: "datePicker",
                attr: "startDate",
                label: translate("Earliest schedule date", "Fr\xFChestes Datum des Heizplans"),
                help: translate(
                  "Optional: the schedule may assign this mode from this date onwards.",
                  "Optional: Ab diesem Datum darf der Heizplan diesen Modus zuweisen."
                ),
                default: "",
                newLine: true,
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
  return {
    _validNumericStateIds: Object.keys(numericStateNames),
    heatingType: schedule.heatingType,
    setpointMappings: schedule.setpointMappings.map((mapping) => ({
      ...mapping,
      name: mappingDisplayName(mapping, schedule.setpointMappings, numericStateNames)
    })),
    heatingModes: schedule.heatingModes.map((mode) => ({ ...mode, weekdays: [...mode.weekdays] }))
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
            await this.adapter.addHeatingSchedule(getName(data));
            return { refresh: "devices" };
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
  deviceInfo(schedule) {
    const configureHandler = this.safeActionHandler(
      "configureSchedule",
      async (_id, context) => {
        const numericStateNames = await this.adapter.getNumericStateNames();
        const data = await context.showForm(scheduleConfigurationForm(), {
          title: translate("Configure heating schedule", "Heizplan konfigurieren"),
          data: scheduleConfigurationData(schedule, numericStateNames),
          buttons: ["apply", "cancel"],
          applyDisabledRule: numericStateConfigurationDisabledRule(Object.keys(numericStateNames))
        });
        if (!data) {
          return { refresh: "none" };
        }
        await this.adapter.updateHeatingSchedule(schedule.id, {
          name: schedule.name,
          heatingType: getHeatingType(data),
          setpointMappings: normalizeMappingFormRows(data.setpointMappings),
          heatingModes: Array.isArray(data.heatingModes) ? data.heatingModes : []
        });
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
            return { refresh: "devices" };
          })
        }
      ]
    };
    const modeControls = {
      scheduleActive: {
        type: "state",
        oid: `schedules.${schedule.id}.active`,
        control: "switch",
        label: translate("Heating schedule active", "Heizplan aktiv"),
        size: "small",
        style: {
          marginTop: -48,
          marginBottom: 8,
          "& .MuiSwitch-root": {
            transform: "scale(0.82)",
            transformOrigin: "right center"
          }
        },
        newLine: true,
        xs: 12
      },
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
                  mapping,
                  schedule.setpointMappings
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
                  mapping,
                  schedule.setpointMappings
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
            `active_${mode.id}`,
            {
              type: "state",
              oid: `schedules.${schedule.id}.heatingModes.${mode.id}.active`,
              control: "switch",
              label: mode.name,
              style: { marginTop: -10, marginBottom: -2 },
              newLine: true,
              xs: 8,
              sm: 9
            }
          ],
          [
            `activate_${mode.id}`,
            {
              type: "state",
              oid: `schedules.${schedule.id}.heatingModes.${mode.id}.activate`,
              control: "button",
              buttonValue: true,
              falseText: translate("Run", "Start"),
              icon: "play",
              variant: "text",
              tooltip: translate("Activate this heating mode now", "Diesen Heizmodus jetzt aktivieren"),
              style: { marginTop: -10, marginBottom: -2, textAlign: "right" },
              newLine: false,
              xs: 4,
              sm: 3
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
  refreshDeviceInGui(scheduleId) {
    const schedule = this.adapter.getHeatingSchedules().find((candidate) => candidate.id === scheduleId);
    if (!schedule) {
      return { refresh: "devices" };
    }
    return { refresh: "devices" };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HeatingSchedulerManagement
});
//# sourceMappingURL=schedule-management.js.map
