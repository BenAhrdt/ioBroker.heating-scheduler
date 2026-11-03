![Heating Scheduler logo](admin/heating-scheduler.png)

# ioBroker.heating-scheduler

[![NPM version](https://img.shields.io/npm/v/iobroker.heating-scheduler.svg)](https://www.npmjs.com/package/iobroker.heating-scheduler)
[![Downloads](https://img.shields.io/npm/dm/iobroker.heating-scheduler.svg)](https://www.npmjs.com/package/iobroker.heating-scheduler)
![Number of Installations](https://iobroker.live/badges/heating-scheduler-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/heating-scheduler-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.heating-scheduler.png?downloads=true)](https://nodei.co/npm/iobroker.heating-scheduler/)

**Tests:** ![Test and Release](https://github.com/BenAhrdt/ioBroker.heating-scheduler/workflows/Test%20and%20Release/badge.svg)

## Heating Scheduler

Heating Scheduler creates and manages configurable heating schedules for thermostats in ioBroker.

The adapter is currently in early development. Heating modes belong to a heating schedule and are not independent devices.

## Features

- Manage multiple heating schedules through the ioBroker Device Manager.
- Configure setpoint and optional feedback state mappings.
- Define heating modes with weekdays, start times, start dates and target temperatures.
- Enable or disable a complete heating schedule or individual heating modes.
- Choose between radiator and underfloor heating per schedule; the card color and icon reflect the selected system.
- Use translated schedule and heating-mode names through the object metadata.
- Keep the authoritative configuration in the versioned schedules structure.
- Create delayed instance-native configuration backups and restore them when needed.

## Configuration model

The adapter uses schema version 3. A schedule is represented by a valid ioBroker device object below the technical schedules root because ioBroker does not provide a dedicated schedule object type.

    schedules
    └── schedule_001
        ├── active
        ├── setpointMappings
        └── heatingModes
            └── mode_001

Heating modes remain children of their schedule. There is no migration from earlier configuration formats because this adapter has no productive legacy installations.

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.1.3 (2026-11-03)

- Updated repository validation, CI workflows and translations after the adapter check.
- Added optional heating-system activation dates and refined the Device Manager configuration controls.
- New heating schedules now use the smallest free technical schedule number.
- Device cards are reassigned through a direct Device Manager update after structural schedule changes.
- A central schedule button can apply the most recent matching heating mode for the current time and weekday.
- A second schedule button applies only the heating mode that automation would currently select; it is hidden when the schedule or all modes are inactive and otherwise does nothing if no active mode matches.
- Heating-mode action buttons display the target temperature in a consistently sized outlined button; central schedule actions use outlined setpoint labels.
- Schedule and heating-mode cards show their optional automatic activation details in a compact secondary line.

### 0.1.2 (2026-11-02)

- Added radiator and underfloor-heating selection with type-specific Device Manager colors and icons.
- Improved device-list refresh compatibility after saving or renaming a schedule.
- Added live setpoint and feedback values to schedule cards and a direct start button for every heating mode.

### 0.1.1 (2026-11-02)

- Updated the adapter logo and README documentation.
- Prepared automatic npm publishing for version tags through GitHub Actions and npm Trusted Publishing.

### 0.1.0 (2026-11-02)

- (BenAhrdt) Added the versioned Heating Scheduler schedule configuration foundation with stable technical schedule IDs.
- (BenAhrdt) Added the neutral Device Manager integration for adding, editing, renaming, and deleting schedules.
- (BenAhrdt) Added authoritative persistence in the schedules object with normalization and schema-version support.
- (BenAhrdt) Added delayed instance-native configuration backup with deep-change detection and restore support.
- (BenAhrdt) Added responsive Admin configuration for the Device Manager link, backup delay, and manual backup actions.
- (BenAhrdt) Added schema-versioned setpoint/feedback mappings and Heating Modes accordions with per-mode runtime activation states.
- (BenAhrdt) Removed redundant schedule and heating-mode name states; fixed object labels use translated names.
- (BenAhrdt) Made weekday selection and feedback mode numeric state enums, added editable mapped state IDs, tabbed configuration without redundant name fields, and a compact header activation control in the Device Manager.
- (BenAhrdt) Refreshed the Device Manager after saving or renaming, tightened the heating-mode card layout, and added translated global and temperature controls.

Older changes are kept in [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License

MIT License

Copyright (c) 2026 BenAhrdt <github@ben-schmidt.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
