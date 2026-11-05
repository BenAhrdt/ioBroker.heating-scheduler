# Older changes

There are no older published versions yet. The current development changes are
listed in the [README changelog](README.md#changelog).
## 0.1.3 (2026-11-03)

- Updated repository validation, CI workflows and translations after the adapter check.
- Added optional heating-system activation dates and refined the Device Manager configuration controls.
- New heating schedules now use the smallest free technical schedule number.
- Device cards are reassigned through a direct Device Manager update after structural schedule changes.
- A central schedule button can apply the most recent matching heating mode for the current time and weekday.
- A second schedule button applies only the heating mode that automation would currently select from the enabled modes; it is hidden when all modes are disabled and otherwise does nothing if no enabled mode matches, even when the schedule itself is disabled.
- Heating-mode action buttons display the target temperature in a consistently sized outlined button; central schedule actions use outlined setpoint labels.
- Schedule and heating-mode cards show their optional automatic activation details in a compact secondary line.

## 0.1.2 (2026-11-02)

- Added radiator and underfloor-heating selection with type-specific Device Manager colors and icons.
- Improved device-list refresh compatibility after saving or renaming a schedule.
- Added live setpoint and feedback values to schedule cards and a direct start button for every heating mode.

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
