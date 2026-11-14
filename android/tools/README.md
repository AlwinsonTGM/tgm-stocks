# Icon source

`E2.png` is the 1536x1536 source artwork for the TGM Stocks launcher icon. It is
kept here so the generated density icons can be reproduced from a clean clone.

Regenerate every launcher icon asset with:

```powershell
powershell -ExecutionPolicy Bypass -File android/tools/make_icons.ps1 -Source android/tools/E2.png
```

The script writes legacy `ic_launcher` / `ic_launcher_round` PNGs at mdpi through
xxxhdpi, the adaptive foreground and background, and the `mipmap-anydpi-v26`
adaptive icon definitions. See `android/README.md` for details.
