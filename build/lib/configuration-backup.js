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
var configuration_backup_exports = {};
__export(configuration_backup_exports, {
  configurationBackupNeedsUpdate: () => configurationBackupNeedsUpdate,
  getRestorableConfigurationBackup: () => getRestorableConfigurationBackup
});
module.exports = __toCommonJS(configuration_backup_exports);
var import_node_util = require("node:util");
var import_configuration = require("./configuration");
function configurationBackupNeedsUpdate(schedulesNative, backup) {
  return !(0, import_node_util.isDeepStrictEqual)(schedulesNative, backup);
}
function getRestorableConfigurationBackup(value) {
  const configuration = (0, import_configuration.normalizeConfiguration)(value);
  return (0, import_configuration.isEmptyConfiguration)(configuration) ? void 0 : configuration;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  configurationBackupNeedsUpdate,
  getRestorableConfigurationBackup
});
//# sourceMappingURL=configuration-backup.js.map
