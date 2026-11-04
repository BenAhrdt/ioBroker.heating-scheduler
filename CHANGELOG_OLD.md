# Older changes

There are no older published versions yet. The current development changes are
listed in the [README changelog](README.md#changelog).
## 0.1.1 (2026-11-02)

- Updated the adapter logo and README documentation.
- Prepared automatic npm publishing for version tags through GitHub Actions and npm Trusted Publishing.

## 0.1.0 (2026-11-02)

- (BenAhrdt) Added the versioned Heating Scheduler schedule configuration foundation with stable technical schedule IDs.
- (BenAhrdt) Added the neutral Device Manager integration for adding, editing, renaming, and deleting schedules.
- (BenAhrdt) Added authoritative persistence in the schedules object with normalization and schema-version support.
- (BenAhrdt) Added delayed instance-native configuration backup with deep-change detection and restore support.
- (BenAhrdt) Added responsive Admin configuration for the Device Manager link, backup delay, and manual backup actions.
- (BenAhrdt) Added schema-versioned setpoint/feedback mappings and Heating Modes accordions with per-mode runtime activation states.
- (BenAhrdt) Removed redundant schedule and heating-mode name states; fixed object labels use translated names.
- (BenAhrdt) Made weekday selection and feedback mode numeric state enums, added editable mapped state IDs, tabbed configuration without redundant name fields, and a compact header activation control in the Device Manager.
- (BenAhrdt) Refreshed the Device Manager after saving or renaming, tightened the heating-mode card layout, and added translated global and temperature controls.
