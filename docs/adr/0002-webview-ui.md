# The UI is the existing web frontend in a WebView

The app renders `apps/dsa-web` in a WebView rather than reimplementing the interface in Compose. The web UI already covers every screen the four-feature v1 needs, and one frontend keeps the Android and desktop surfaces in step. A native UI would be months of work for identical functionality.

**Consequences**: Android-specific affordances (back button, file pickers, notifications) must be bridged explicitly, and WebView debugging must be off in release builds.
