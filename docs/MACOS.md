# Running on a Mac

The companion is an Electron app and runs on macOS. **The unlock/root workflow is not native to macOS.** This page separates what works from what still needs Windows, and lists the real options.

## Short answer

- **Planning, files, checks, guide, support:** yes, works on this Mac.
- **Build the upstream WinUI toolkit:** no, Windows only.
- **EDL write / bootloader unlock / app-driven root:** no, Windows only.
- **A Mac-only path exists in principle** (`bkerler/edl`), but it is a separate manual route, not what this app uses, and it is not tested here.

## What works on macOS

| Area | Works? | Notes |
|---|---|---|
| Companion UI, Step by step, support panel | Yes | Tested on macOS; 44 unit / 32 Playwright checks |
| Tool-pack inventory, imports and downloads | Yes | Open tools and the external pack can be downloaded and hash-checked |
| `adb` and `fastboot` commands | Yes | Real commands were executed during macOS verification |
| Device passport, battery, OS, apps via adb | Yes, if authorized | No Windows driver check |
| System check: tool versions, phone state, manager apps | Yes | Driver rows correctly report Windows-only |
| Diagnostics, masked support summary, GitHub issue template | Yes | Serial is masked in diagnostics |
| Light and dark themes | Yes | Verified |
| Build `MatePadToolbox.exe` | **No** | Upstream WinUI 3 / XAML compiler is Windows-only |
| `QSaharaServer.exe`, `fh_loader.exe`, Qualcomm 9008 driver | **No** | Windows PE binaries and Windows kernel USB drivers |
| EDL write, unlock, root through this app | **No** | The app deliberately does not implement device writes |

The app blocks the build at `src/main/builder.js` on non-Windows and the unlock gate requires Windows. That is intentional, not a missing checkbox.

## What is missing on a Mac

1. **WinUI build host.** The upstream app is `net8.0-windows` WinUI 3. Its XAML compiler is a Windows executable; `dotnet publish` on macOS cannot complete the desktop target.
2. **EDL tools.** `QSaharaServer.exe` and `fh_loader.exe` are Windows PE programs. They need a Windows COM port and the Qualcomm USB driver.
3. **Drivers.** The ADB/QDLoader drivers are Windows kernel-mode USB drivers. macOS does not use them.
4. **The write path.** The companion intentionally leaves every EDL write to the upstream toolkit. It has no native EDL backend to replace it.

## Options, from best to worst

### 1. Use the Windows PC — recommended

This is the supported path. Copy the Windows app ZIP and, if you have it, the preloaded workspace ZIP. Follow the in-app Step by step page. The app cannot verify your Windows build until you run it there.

### 2. Intel Mac: Boot Camp or a USB-passthrough VM

An Intel Mac can run native x64 Windows through Boot Camp, or a VM such as Parallels/VMware with USB passthrough. The 9008 device must be assigned to Windows and visible as a Qualcomm port. This can work, but you must test the EDL device and the drivers yourself.

### 3. Apple Silicon Mac (this machine): no Boot Camp

This Mac is **Apple Silicon (arm64)**. There is no Boot Camp. A Windows 11 ARM VM is not a reliable substitute:

- Windows on ARM emulates x64 **user-mode** programs, but the ADB/QDLoader **kernel drivers** are x64 and need ARM64 drivers to load.
- USB passthrough of the 9008 device into the VM is unproven and often disconnects while switching modes.
- A fully emulated x64 Windows VM (UTM/QEMU) with USB passthrough is experimental, slow and not supported.

Do not plan a first unlock around an Apple Silicon Windows VM.

### 4. Native macOS `edl` — advanced, unverified

The independent guide uses `bkerler/edl`, which is cross-platform and talks to 9008 over libusb without Windows drivers. In principle the signed firehose and ABL in the workspace could be written from macOS. However:

- This app does **not** use that backend and does not perform the write.
- The exact partition/ABL sequence, device permissions and recovery steps are outside this app's tested workflow.
- A wrong EDL write can hard-brick the tablet.
- Root tooling availability for macOS is not tested here.

Treat this as a separate project, not a supported option.

## Read-only Mac checklist

1. Run the companion on the Mac and open **Step by step**.
2. Complete the safety brief and inspect the tool pack.
3. Use **Device → System check** with the tablet connected and USB debugging authorized.
4. Download/verify the files; export diagnostics.
5. Move the app ZIP and your workspace to the Windows PC for the build and write.
6. Do not type `WIPE` or start an EDL write on the Mac expecting the app to finish it.

## Related

- [Windows runbook](WINDOWS-RUNBOOK.md)
- [Tool pack](TOOL-PACK.md)
- [Verification](VERIFICATION.md)
