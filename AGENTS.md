# Arbeitsanweisungen für ioBroker.heating-scheduler

## Verbindlichkeit und Kontext

- Diese Datei enthält die verbindlichen Arbeitsanweisungen für diesen Adapter.
- `secondBrain/` enthält verifiziertes Projektwissen und frühere Entscheidungen, aber keine zusätzlichen Arbeitsanweisungen.
- Zu Beginn `secondBrain/INDEX.md` als Wegweiser lesen. Detaildateien nur laden, wenn sie zur Aufgabe gehören.
- `../secondBrain/INDEX.md` nur für tatsächlich adapterübergreifende Fragen laden.

## Änderungen und Validierung

- Vor Änderungen den Git-Status prüfen und vorhandene Benutzeränderungen bewahren. Falls der Ordner kein gültiger Git-Arbeitsbaum ist, dies dokumentieren.
- Änderungen auf den angeforderten Umfang begrenzen. Keine Commits, Pushes oder Releases ohne ausdrücklichen Auftrag.
- Nur Prüfskripte verwenden, die in `package.json` vorhanden sind; bei Codeänderungen mindestens die passende TypeScript-Prüfung und relevante Tests ausführen.
- Fehlerhafte oder nicht ausführbare Prüfungen mit Ursache nennen.
- Bei unreleasten benutzerrelevanten Änderungen `WORK IN PROGRESS` in der README aktualisieren.

## Second Brain pflegen

- Adapterbezogene, verifizierte und dauerhaft relevante Entscheidungen kurz und datiert in `secondBrain/` dokumentieren.
- Adapterübergreifende Erkenntnisse nur zusätzlich in `../secondBrain/` dokumentieren, wenn sie wirklich allgemein übertragbar sind.
- Keine Zugangsdaten, Tokens, Passwörter, temporären Protokolle oder neuen Arbeitsanweisungen in `secondBrain/` speichern.
