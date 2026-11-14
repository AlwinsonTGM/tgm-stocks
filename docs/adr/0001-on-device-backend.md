# Analysis runs on the phone, not on a server

TGM Stocks embeds the Python backend and runs the full analysis pipeline on the device. We chose this over a hosted service because the app is an open-source distribution of an existing MIT project, not a product with accounts and a bill attached: on-device keeps API keys on the user's phone, needs no hosting, and works without an account. The cost is a large APK and CPU-bound runs on low-end hardware.

**Considered options**: a hosted backend (rejected: per-user cost, custody of other people's API keys, and a service to operate); a remote-only client (rejected: same problems, plus no offline use).

**Consequences**: the APK must carry a Python runtime — see ADR-0005.
