# Persistenz und Backup

Verifiziertes, adapterspezifisches Projektwissen; keine zusätzlichen Arbeitsanweisungen.

- 2026-11-02: `schedules.native` enthält als vollständige Struktur `schemaVersion`, `schedules` und `nextScheduleNumber`. Das ist die einzige autoritative Konfigurationsquelle.
- 2026-11-02: Schema-Version 3 enthält pro Heizplan `setpointMappings`, `heatingModes` sowie technische Zähler für stabile Kind-IDs. Heating Modes können zusätzlich ein optionales `startDate` enthalten; eine Migration aus `devices.native` ist nicht vorgesehen.
- 2026-11-01: Die Konfiguration wird beim Start normalisiert und validiert. Nicht unterstützte Schema-Versionen ergeben eine leere sichere Konfiguration; die Migrationsfunktion ist für spätere Versionen vorgesehen.
- 2026-11-02: `weekdaySelection` und `feedbackMode` werden kanonisch als numerische Enums 0, 1 oder 2 gespeichert. Die Normalisierung übernimmt die bisherigen Stringwerte weiterhin verlustarm.
- 2026-11-02: Die konfigurierbaren Werte werden als States unter dem jeweiligen Heizplan gespiegelt und bei `ack=false` zurück in `schedules.native` geschrieben. Technische IDs bleiben unveränderlich; Heizplan-/Modus-`active` und `activate` sind Runtime-States und werden nicht in `native` gespeichert. Sollwertschreiben und unabhängige Rückmeldeprüfung sind implementiert; das optionale `startDate` wird bei leerem Wert ignoriert.
- 2026-11-02: Ein verzögertes Backup liegt als `system.adapter.<namespace>.native.scheduleConfigurationBackup`. Der Timer wird nach Änderungen neu gestartet, `0` deaktiviert ihn, und identische Inhalte werden per tiefer Gleichheit nicht erneut geschrieben.
- 2026-11-01: Ein vorhandenes, nicht leeres und gültiges Instanz-Backup wird beim Start wiederhergestellt, wenn die aktuelle Heizpläne-Konfiguration fehlt oder leer ist. Manuelle Backup- und Restore-Befehle sind über `sendTo` verfügbar.
