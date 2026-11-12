# MatePad 11 Companion

A Windows companion for [run2000s/MatePad11_Tool_Kit_GUI](https://github.com/run2000s/MatePad11_Tool_Kit_GUI) — the WinUI 3 toolkit for the Huawei MatePad 11 (**DBY-W09**). It prepares the toolkit on a fresh PC, names every file the flash expects, reads the tablet, and walks the unlock-then-root procedure with hard gates. **The actual device writes stay in the upstream toolkit.**

![Overview](docs/img/overview.jpg)

## Why this exists

The upstream project is source-only. There is no release, no bundled tool pack, and it is a .NET 8 / WinUI 3 build. Its own home screen checks only three files (`adb.exe`, `fastboot.exe`, `7z.exe`) — the unlock images, Qualcomm EDL tools, drivers, APatch tools and ramdisk images are discovered much later, mid-procedure.

This companion adds the missing layer:

- **Prepare** — detect Windows/.NET, download the GPL source, install .NET 8 per-user if needed, run `dotnet publish`, launch the result.
- **Provision** — inventory all 27 expected paths from the upstream `AppConfig.cs`, auto-download open tools, import the proprietary pack by ZIP/folder, record hashes.
- **Read the device** — model, HarmonyOS version, API, battery, storage, USB authorization, bootloader state, root check, 9008/EDL COM presence.
- **Route** — HarmonyOS 2/3 gets the ADB → EDL path; HarmonyOS 4 gets the engineering-cable/downgrade path, never the wrong one.
- **Gate** — DBY-W09 only, battery and disk checks, data-wipe acknowledgement, tool-pack completeness, typed `WIPE` confirmation.
- **Guide** — step ledgers with expected outputs and troubleshooting, for both the ADB and engineering-cable branches, APatch and Magisk root.
- **Record** — persistent progress, live console, diagnostics export with the serial masked.

## What it deliberately does not do

- It does **not** implement EDL/9008 writes. Those remain in the upstream `MatePadToolbox`.
- It does **not** bundle or redistribute the upstream binary, the proprietary Qualcomm/Huawei files, drivers, or unlock images.
- It does **not** bypass Huawei ID, FRP, or any account/anti-theft control.
- It does **not** promise that unlocking or rooting is safe. A wrong EDL write can hard-brick the tablet.

## Status — read this before you rely on it

| Area | State |
|---|---|
| UI and logic | **Verified on macOS**: 34 unit tests, 23 Playwright checks against the real Electron app, EN + 中文, 1440/1120 widths, zero renderer errors |
| Official downloads | **Verified live**: platform-tools, 7-Zip, KernelPatch (kptools + kpimg), Magisk release, safe ZIP extraction |
| Tool-pack import | **Verified** with a synthetic pack and a synthetic ramdisk; canonical paths and hash recording confirmed |
| Windows package | **Built** (`win32-x64`, unsigned) and inspected, but **not executed** — the agent had no Windows host |
| .NET install + upstream WinUI build | **Not executed** (Windows-only XAML compiler); the command, logging and failure paths are implemented |
| Real tablet, EDL write, unlock, root | **Not tested** — no DBY-W09, no proprietary tool pack, no Windows host here |

The app is honest about this in **Settings → About** and in the diagnostics bundle. Treat the Windows-only steps as a runbook that still needs a first real run on your PC.

## The one thing you must supply: the proprietary tool pack

The upstream repo intentionally omits:

`QSaharaServer.exe`, `fh_loader.exe`, `ptool.exe`, `driver/adbdriver.exe`, `driver/qcdriver.exe`, `unlock/Huawei865870_devprg.elf`, `unlock/Huawei865870_abl_unlock.img`, `tools/rawprogram/*`, `vbmeta/vbmeta.zip`, `HiSuiteProxy/*`, and the signed unlock files.

The companion's **Tool pack → Import** accepts the ZIP or folder you got with the original toolkit and copies recognized files into the exact layout. It never downloads these from mirrors. See **[docs/TOOL-PACK.md](docs/TOOL-PACK.md)** for the full mapping, sourcing rules, and the independent guide's published hashes for the signed firehose/ABL.

**Without this pack the app can prepare everything and read the tablet, but it cannot unlock or root.** The UI says so and blocks the unlock action.

## Quick start on the Windows PC

1. Copy **`dist/MatePad-11-Companion-1.0.0-win-x64.zip`** to the Windows 10/11 x64 PC, unzip it anywhere writable (not `Program Files`).
2. Run **`MatePad 11 Companion.exe`**. It is unsigned, so SmartScreen may show “Windows protected your PC” → **More info → Run anyway**.
3. **Prepare** → choose a workspace (default `C:\Users\<you>\MatePad11`) → **Download & build**. The app installs .NET 8 into the workspace if needed, fetches the upstream source, runs `dotnet publish`, and shows the full log.
4. **Tool pack** → import the proprietary pack, then download the open tools from the official sources. Required file count must be complete for your root method.
5. **Device** → enable USB debugging, connect a data cable, accept the RSA prompt, press **Detect tablet**. Confirm DBY-W09 and the HarmonyOS branch.
6. **Unlock** → read the preflight, type `WIPE`, confirm the backup, then **Open toolkit → Unlock BL** and follow the branch-specific steps. Verify with **Check bootloader** (fastboot `unlocked: yes`).
7. **Root** → choose APatch (automated boot patch via 9008) or Magisk (patched ramdisk you provide), follow the steps, then **Verify root** (`adb shell su -c id` → `uid=0(root)`).

Full runbook: **[docs/WINDOWS-RUNBOOK.md](docs/WINDOWS-RUNBOOK.md)**

## HarmonyOS routing

| Detected version | Unlock route | Notes |
|---|---|---|
| HarmonyOS 2.x / 3.x | ADB → EDL | Toolkit runs `adb reboot edl`, uploads the firehose, writes the unlock ABL, resets. Some global 3.x builds ignore the reboot; the app says to stop, not retry blindly. |
| HarmonyOS 4.x | Engineering cable / test-point short, or downgrade | ADB cannot enter EDL; the app closes the step list and links the independent HOS 4.2 write-up. |
| Unknown | No route | The app refuses to guess; connect the tablet or check Settings → About tablet. |

## Root methods

| Method | What the toolkit does | What you provide |
|---|---|---|
| **APatch** (recommended default) | 9008 extracts `boot`, `kptools` unpacks/patches/repacks with `kpimg-android`, fastboot flashes the patched boot | KernelPatch `kptools.exe` + `kpimg-android` (official download), APatch APK, 9008 access |
| **Magisk** | Fastboot flashes a pre-patched `ramdisk` image | The exact matching stock ramdisk, patched by Magisk on the tablet, copied into `ramdisk/` |

Both require an unlocked bootloader. Both have a switch-method control; prerequisites update immediately.

## Screens

| | |
|---|---|
| ![Tool pack](docs/img/tools.jpg) | ![Inventory](docs/img/inventory.jpg) |
| ![Unlock](docs/img/unlock.jpg) | ![Root](docs/img/root.jpg) |
| ![Device](docs/img/device.jpg) | ![Console](docs/img/console.jpg) |

## Safety

- **Unlocking erases all user data.** Take an EDL backup first. The independent guide measured ~13 GB and 73 partitions for a full read-back.
- **Never flash the stock ABL after unlocking.** It relocks the bootloader; on HarmonyOS 4 you may not get back into EDL.
- **Never relock while a patched boot/ramdisk is installed.**
- **Never accept an OTA or HiSuite update after unlocking.**
- Battery above 60%, a data cable directly into the PC, no hub, no sleep during a write.
- The companion runs only read-only device commands, plus reboot/APK-install actions you explicitly press. Every flash is performed by the upstream toolkit.

## Development

```bash
cd app
npm install
npm start            # real state (macOS/Linux preview; Windows for the full path)
npm run demo         # simulated DBY-W09, no device commands
npm test             # 34 node:test checks
node scripts/e2e.mjs # 23 Playwright checks against the real Electron app
npm run pack:win     # win32-x64 folder in ../dist
```

Architecture: Electron main process (`app/src/main/*`) owns filesystem/process/device work; a pure core (`app/src/core/*`) owns parsers, inventory and gates; the renderer (`app/src/renderer/*`) is vanilla HTML/CSS/JS with a context-isolated preload. No network server, no telemetry. State lives in Electron `userData`; demo mode is an in-memory overlay and never writes over real settings.

The upstream source is GPL-3.0-or-later and is downloaded at runtime; see [THIRD-PARTY.md](THIRD-PARTY.md). This companion is MIT-licensed (see [COMPANION-LICENSE.txt](COMPANION-LICENSE.txt)). Not affiliated with Huawei, Qualcomm, or the upstream author.

## Verification

See **[docs/VERIFICATION.md](docs/VERIFICATION.md)** for exactly what was run, what passed, and what remains unverified.
