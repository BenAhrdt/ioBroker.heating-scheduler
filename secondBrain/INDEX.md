# Second Brain: ioBroker.heating-scheduler

Dieses Verzeichnis enthält verifiziertes, dauerhaft relevantes Wissen zum Adapter. Verbindliche Arbeitsregeln stehen in [`../AGENTS.md`](../AGENTS.md).

## Zweck des Adapters

Der Adapter bildet konfigurierbare Heizpläne ab. Die Heating Modes sind die Modi innerhalb eines Heizplans; weitergehende Fachlogik gehört erst nach ihrer Spezifikation in die technische Grundlage.

## Themen

- [Device Manager](device-manager.md): Heizplanidentität, neutrale Karten und Aktionen.
- [Persistenz und Backup](persistence.md): autoritative Konfiguration, Schema und Instanz-Backup.

## Dauerhafte Erkenntnisse

Kurze Einträge mit Datum (`YYYY-MM-DD`) ergänzen; ausführliche Zusammenhänge in verlinkte Themendateien auslagern.

- 2026-11-02: Die vollständige autoritative Konfiguration liegt als Schema-Version 3 im `native` des Ordners `schedules`; Schedule-Objekte und Runtime-States sind davon abgeleitete ioBroker-Objekte.
- 2026-11-02: Schema-Version 3 enthält unabhängige Sollwert-/Rückmelde-Zuordnungen und Heating Modes innerhalb jedes Heizplans. Eine Migration aus der früheren `devices`-Struktur ist nicht vorgesehen.
- 2026-11-02: Heizplan- und Heizmodusnamen werden ausschließlich als `common.name` des jeweiligen Schedule-/Channel-Objekts geführt; redundante `name`-States werden bei der Objektsynchronisierung entfernt.
- 2026-11-02: `weekdaySelection` nutzt die numerischen Werte 0 (alle Tage), 1 (einschließen) und 2 (ausschließen); `feedbackMode` nutzt 0 (bei Änderung), 1 (bei Aktualisierung) und 2 (zyklisch). Alte Stringwerte werden beim Normalisieren übernommen.
