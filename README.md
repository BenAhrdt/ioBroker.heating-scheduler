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
- Assign a priority to each heating mode; higher priorities win when enabled modes overlap.
- Enable or disable a complete heating schedule or individual heating modes.
- Keep advanced manual apply actions and mode priorities available through the Device Manager expert mode.
- Choose between radiator and underfloor heating per schedule; the card color and icon reflect the selected system.
- Use translated schedule and heating-mode names through the object metadata.
- Keep the authoritative configuration in the versioned schedules structure.
- Create delayed instance-native configuration backups and restore them when needed.

## Configuration model

The adapter uses schema version 3. A schedule is represented by a valid ioBroker device object below the technical schedules root because ioBroker does not provide a dedicated schedule object type.

    schedules
    └── schedule_001
        ├── enabled
        ├── applyMatching
        ├── applyEnabledMatching
        ├── applyEnabledModeMatching
        ├── setpointMappings
        │   └── mapping_001
        │       ├── feedbackMonitoringWhenScheduleEnabled
        │       └── feedbackMonitoringWhenScheduleDisabled
        └── heatingModes
            └── mode_001

Each heating mode has a priority with a default value of `0`. Higher values win when multiple enabled modes are currently applicable. Equal priorities use the most recent matching rule; identical rules use the later configured mode as a deterministic tie-breaker.

Heating modes remain children of their schedule. There is no migration from earlier configuration formats because this adapter has no productive legacy installations.

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.1.8 (2026-11-05)

- Automatic schedule evaluation now runs at startup, after relevant state or configuration changes, and at the next scheduled mode time or local day boundary. It compares the current setpoint and writes only when the selected mode requires a different value.
- Feedback monitoring is configured independently for each setpoint/feedback mapping. `feedbackMonitoringWhenScheduleEnabled` and `feedbackMonitoringWhenScheduleDisabled` decide whether the mapping is monitored in each schedule state; both default to enabled for mappings with a feedback state and are shown only in the configuration dialog's expert mode.

### 0.1.7 (2026-11-04)

- Heating modes now support non-negative integer priorities. Automatic evaluation and the enabled-mode matching actions select the highest-priority applicable enabled mode; the broader matching action also uses priority but intentionally ignores enable switches. Manual per-mode application remains an explicit override.
- Device Manager priority fields, mode-level Apply buttons, and the schedule-level enabled-mode Apply button are shown only when the adapter's Device Manager expert mode is enabled.

### 0.1.6 (2026-11-04)

- Activation dates are labeled "Activate from" / "Aktivieren ab" and "Deactivate from" / "Deaktivieren ab"; they are independent switches and may be entered in either order. Saving errors are shown explicitly, and Device Manager cards are updated directly after a successful save.

### 0.1.5 (2026-11-03)

- Editing a schedule preserves its existing `enabled` states; only new schedules/modes or changed activation dates initialize them from the current date.
- `applyEnabledModeMatching` applies the mode that would be selected from the enabled Heating Modes even while the schedule itself is disabled.
- The Device Manager card shows only the safe enabled-mode action; the broader apply states remain available for scripts and advanced integrations.

### 0.1.4 (2026-11-03)

- Renamed runtime states to distinguish persistent enablement from one-time apply commands (`enabled`, `applyMatching`, `applyEnabledMatching`, `applyEnabledModeMatching`, and `applyNow`); existing runtime states are migrated during synchronization.

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
