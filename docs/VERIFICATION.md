# Verification record

Date: **2026-11-12**  
Host: macOS 27.2.1 (arm64), Node v24.22.2, Electron 33.4.11, Playwright 1.55.0, Python 3.9.6  
Windows host: **none**  
MatePad 11: **none**  
Proprietary tool pack: **none** (a synthetic pack was used)

This file records what actually ran. It is deliberately narrower than “the app works on Windows”.

## Automated unit tests — 55 passed

Command: `cd app && npm test`

Coverage:

- `adb devices -l`, fastboot devices, getprop, `dumpsys battery`, `df -k /data`, fastboot getvar, dotnet SDK parsing.
- HarmonyOS detection (`hw_sc.build.platform.version`), model classification (DBY-W09 / DBY-W09S / other), unlock routing.
- Gates: DBY-only, 40% hard battery floor, 60% warning, 15 GB hard disk floor, backup acknowledgement, missing tool-pack files.
- Readiness across six steps; macOS is preview-only; unlock/root transitions.
- Inventory: canonical paths, required sets (APatch 10, Magisk 9), safe path joining, import name matching.
- ZIP traversal rejection and safe extraction.
- Importer: mixed folder → canonical layout, arbitrary ramdisk `.img`, demo refusal.
- State: demo overlay does not overwrite real settings, language/progress/theme reload, reset semantics; theme validation and demo/real preference synchronization.
- System-check parsers: adb/fastboot versions, package list, Magisk/APatch/KernelSU, developer settings, su, Windows PnP classification, summary states.
- EDL PowerShell JSON parsing (object/array/prefixed/BOM-less), COM extraction.

Result: **55 pass, 0 fail**. All renderer translation keys used literally are present in both `en` and `zh` (569 literal keys checked; dynamic keys spot-checked).

## End-to-end — 39 checks passed

Command: `cd app && node scripts/e2e.mjs` (Playwright launches the real Electron app).

Demo profile, 1440×900 and 1120×760:

1. Boots with six readiness steps, 4/6 ready, DBY-W09 demo device, APatch files complete.
2. Prepare renders the Windows-only state.
3. Switching root method recomputes Magisk requirements 7/9.
4. Device passport renders model, OS, battery, props.
5. Unlock branch renders six ADB steps; a step checkbox persists; safety modal opens/closes.
6. Root comparison/prerequisites render.
7. Console logs and text filter work.
8. English → 简体中文 → English switch.
9. No horizontal overflow at 1440 or 1120 in both languages.
10. Demo off → live macOS state → demo on, without corrupting real settings.
11. Build button is disabled on macOS with the Windows-only notice.

Live workspace profile (macOS):

12. **Official platform-tools download + extraction** (8.0 MB ZIP; `adb.exe`, `fastboot.exe`, DLLs).
13. **Official 7-Zip page scrape + `7z2301-extra.7z` extraction**; `7za.exe` copied as `7z.exe` (1.23 MB). On macOS this used the host `7z`; the Windows `7zr.exe` path was not executed.
14. **KernelPatch 0.13.9**: downloaded `kpimg-android` and `kptools-msys2-win.7z`, extracted, selected the Windows x64 binary (782 KB).
15. **Magisk v31.1** official APK (10.7 MB) downloaded and hashed.
16. Real APatch latest APK downloaded and hashed.
17. Synthetic tool pack ZIP (QSaharaServer, fh_loader, ptool, firehose, unlock ABL, rawprogram) imported into canonical paths; APatch requirements 10/10.
18. **External pack fetch** — signed firehose (697,648 B) + ABL (602,112 B) from the public Drive, QSaharaServer (174,592 B), fh_loader 23.06 (485,888 B, supports `--skip_configure`), and the signed Xiaomi driver installer; every file hash-verified and copied to the canonical paths.
19. Synthetic patched ramdisk imported; Magisk requirements 9/9.
20. `build()` on macOS returns a clear Windows-only error without starting a download.
21. Real `adb devices` refresh with no tablet returns `no-device` and does not crash.
22. Typed wipe acknowledgement + guide step persist to `state.json`.
23. Live prepare/tools/inventory screenshots captured.
24. First-run disclaimer gates the app, requires the checkbox, persists, and does not reopen after reload.
25. Typed `WIPE` + backup checkbox records the acknowledgement and updates the UI.
26. **Ready workspace** (25 files) loaded by the app: APatch 10/10, drivers present, external pack 5/5, manifest and tool files validated.
27. Light mode: topbar toggle applies light tokens (body `rgb(244, 241, 234)`), persists across reload, restores dark; Appearance control and no-overflow checks pass.
28. System check: real tool checks, Windows driver rows, phone developer/USB/bootloader/root state, Magisk/APatch/KernelSU/su; `Run check` completes with no errors.
29. Live system check: real adb + fastboot version commands execute on this Mac and report pass; drivers correctly report Windows-only.
30. Guided setup: one current step, eight ordered steps, support actions; narrow-width and light-mode screenshots pass.
31. Support summary copy action shows the success toast and completes without renderer errors.
32. Step help expands to What you should see and Common fixes; light/dark screenshots pass.
33. macOS compatibility card renders on a live Mac profile and links to docs/MACOS.md.
34. EDL backup scanner records a folder with images + GPT/XML and unlocks the backup gate; the copied support summary clearly says demo/simulated and no commands were run.
35. App updates card and the persistent top-corner status button render current/latest/check control on the demo profile.
36. Support-session link saves and a debug report copies host, system check and update state.
37. Qualcomm 9008 driver check reports **Driver installed** even while no port is present.
38. Unlock renders HarmonyOS downgrade guidance and the toolkit downgrade button.
39. The no-backup override card is exposed only when no backup is recorded, and the gate override is unit-tested.

Result: **39 pass, 0 fail, zero console errors, zero page errors.**

## Download endpoints actually exercised

| Source | Result |
|---|---|
| `https://dl.google.com/android/repository/platform-tools-latest-windows.zip` | 8.0 MB, extracted, hashes recorded |
| `https://www.7-zip.org/download.html` → `7z2301-extra.7z` | parsed, downloaded, extracted, `7z.exe` installed |
| `https://api.github.com/repos/bmax121/KernelPatch/releases/latest` | 0.13.9, kptools/kpimg installed |
| `https://api.github.com/repos/topjohnwu/Magisk/releases/latest` | v31.1 APK downloaded |
| `https://api.github.com/repos/bmax121/APatch/releases/latest` | build 11282 APK downloaded and hashed |
| Google Drive folder from the XDA guide | signed firehose + ABL downloaded; hashes match the published values |
| `https://gitee.com/aialbb/mi-flash-tool/.../QSaharaServer.exe` | 174,592 B, hash-pinned |
| `https://raw.githubusercontent.com/snowwolf725/OPlus_EDL_Toolkit/.../fh_loader.exe` | 485,888 B, Qualcomm 23.06 build, `--skip_configure` present |
| Xiaomi MiFlash Unlock driver installer | 261,176 B, Authenticode-signed by Beijing Xiaomi |

## Windows package

- Built with `electron-packager` for `win32-x64`, Electron 33.4.11, asar, icon.
- `MatePad 11 Companion.exe` is a PE32+ x86-64 GUI executable; `resources/app.asar` is about 754 KB and contains only runtime files (`main.js`, `preload.js`, `src/**`, `node_modules/adm-zip`, licenses, README-FIRST). Tests, scripts, screenshots, docs, and build assets are excluded.
- A macOS asar build from the same configuration was launched with Playwright: title, Overview, six phases, zero renderer errors. This validates asar packaging, not the Windows binary.
- The ready workspace ZIP was built separately (25 files, 37.9 MiB expanded / 24.9 MiB ZIP) and validated against the app inventory and its own manifest.
- The final app ZIP is rebuilt after the external-pack feature; see `dist/CHECKSUMS.txt` for its SHA-256.
- **Not executed on Windows**: the build host is macOS and no Windows VM was available. Startup, Windows menus, PowerShell execution, .NET install, upstream `dotnet publish`, and launching `MatePadToolbox.exe` remain unverified.

## Not verified

1. Launching `MatePad 11 Companion.exe` on Windows 10/11.
2. Running the downloaded `.NET 8` install script and the upstream WinUI publish (Windows-only XAML compiler).
3. Every `adb`/`fastboot` action against a real DBY-W09: model/version read, unauthorized flow, fastboot unlock check, root check, APK install, reboot.
4. PowerShell 9008 WMI detection on real hardware.
5. `7zr.exe` extraction on Windows (the macOS test used system 7-Zip).
6. Any EDL write, unlock, root, or ROM flash. Those remain inside the untested upstream toolkit.
7. Authenticity of the third-party tool pack files beyond pinned SHA-256. QSaharaServer and fh_loader are unsigned Qualcomm binaries from public mirrors; the driver installer is Xiaomi-signed and its signature was verified with osslsigncode. The signed Huawei images match the independent guide's published hashes.
8. Code signing / SmartScreen reputation. The app build is unsigned.
9. The Windows-specific behavior of the fetched fh_loader/QSaharaServer against a real 9008 device. Option strings were checked statically; no Windows host or tablet was available.

## Evidence

Screenshots (real Electron render, Playwright):

- `app/screens/e2e/01-overview.png`
- `app/screens/e2e/02-prepare.png` (demo), `10-prepare-live-mac.png` (live)
- `app/screens/e2e/03-tools.png`, `11-tools-live-files.png`, `12-tools-inventory.png`
- `app/screens/e2e/04-device.png`
- `app/screens/e2e/05-unlock.png`, `14-unlock-ack-form.png`
- `app/screens/e2e/06-root.png`
- `app/screens/e2e/07-console.png`
- `app/screens/e2e/08-settings-zh.png`
- `app/screens/e2e/09-overview-narrow.png`
- `app/screens/e2e/13-disclaimer.png`
- `17-overview-light.png`, `18-tools-light.png`, `19-unlock-light.png`, `20-settings-light.png`, `21-console-light.png`, `22-modal-light.png`
- `app/screens/e2e/15-tools-ready-workspace.png`, `16-prepare-ready-workspace.png`

The E2E summary JSON (check list + zero errors) is written under the OS temp directory for each run, not committed.


## Artifact

`dist/MatePad-11-Companion-1.7.0-win-x64.zip` contains the unsigned Windows x64 folder build and the user docs. SHA-256 values for the ZIP and the executable are in `dist/CHECKSUMS.txt` and `dist/MatePad-11-Companion-1.7.0-win-x64.zip.sha256`.

## EDL and downgrade

Windows driver inspection now enumerates `pnputil /enum-drivers` in addition to present PnP interfaces. A Qualcomm QDLoader package reports **Driver installed** even without a live 9008 port; missing packages report **Driver missing**. The EDL card can run `adb reboot edl`, open Device Manager, launch `qcdriver.exe`, or rescan. HOS 4 gets a downgrade card linking the toolkit and an independent write-up; firmware is not bundled. The backup gate can be explicitly overridden with `NO BACKUP`, which produces a warning gate and no recovery image. EDL entry/actions and the Windows driver enumeration are **not executed on Windows in this session**.

## Support session

The app stores a support URL locally (http allowed only for localhost; remote links must be HTTPS) and opens it through the OS browser. A debug report copies app/version, host, current view/step, device state without serial, inventory/gates, system-check statuses, update status and the last warning/error logs. There is no telemetry or automatic upload. The local session URL is machine-local; a remote PC needs an authenticated tunnel. See `docs/SUPPORT.md`.

## App updater

The updater checks the latest published GitHub release, selects `MatePad-11-Companion-<version>-win-x64.zip`, verifies the GitHub asset SHA-256 (falling back to the release `.sha256`) and self-replaces only on a packaged Windows build. Mac/dev builds link to the release page. Unit tests cover version comparison, asset selection, trusted URLs and release metadata; the UI card is covered by E2E. A live check run with a simulated 1.4.0 client against GitHub returned latest 1.5.0, the correct Windows asset, and the release SHA-256 digest. The PowerShell folder-swap helper has **not** been executed on Windows in this session.

## Accessibility audit

Axe-core 4.10.2 (WCAG 2.0/2.1 A + AA) was run against Guide, Device, Unlock and Settings in both dark and light themes:

- **0 violations** in all eight view/theme combinations after fixing the light `--text-3` contrast token.
- Micro text minimum is 11px; guide details wrap; icon-only controls carry `aria-label`.
- The optional audit script is `app/scripts/a11y-check.mjs` (dev dependency `axe-core`); it injects a same-origin copy and removes it after the run.

