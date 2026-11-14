# No scheduled runs or image rendering in v1

`SCHEDULE_ENABLED` and image notifications are hidden in the Android build. Scheduled analysis uses `multiprocessing.spawn`, which Android cannot do, and image rendering needs the `wkhtmltopdf` binary, which is absent. A switch that silently fails is worse than no switch.

**Considered options**: WorkManager-based scheduling (deferred: real work, and v1 defers background execution); bundling `wkhtmltopdf` (rejected: size and licensing for a feature v1 does not need).
