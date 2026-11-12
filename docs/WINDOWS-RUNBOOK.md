# Windows runbook — DBY-W09 unlock + root

This is the procedure the companion guides you through. It assumes **one** MatePad 11 (DBY-W09), a Windows 10 1809+/11 x64 PC, a good USB-C **data** cable, and the proprietary tool pack. Read the whole page before starting.

> The agent that built this app had no Windows PC and no tablet. Windows-only steps and real flashing remain unverified. The companion logs every command and refuses to continue when a prerequisite is missing; use those checks, and stop at the first unexpected result.

## 0. Before you touch anything

- [ ] Confirm the model is **DBY-W09** (Settings → About tablet). DBY2, LTE, and other models are different hardware.
- [ ] Confirm the HarmonyOS version. HarmonyOS 2/3 can use ADB → EDL; HarmonyOS 4 needs an engineering cable/test-point short or a downgrade.
- [ ] Back up photos and data. Unlock erases the tablet.
- [ ] Charge above **60%**.
- [ ] Free at least **40 GB** on the PC (the EDL backup can be ~13 GB).
- [ ] Choose a tool source: the preloaded workspace ZIP, the app's **Fetch external pack**, or the original tool pack (see [TOOL-PACK.md](TOOL-PACK.md)).
- [ ] Disconnect other Android devices and close HiSuite / `hwtransport.exe`.

## 1. First run

1. Unzip `MatePad-11-Companion-1.1.0-win-x64.zip` into a writable folder. Do not run it from `Program Files`; the app writes builds and backups.
2. Run `MatePad 11 Companion.exe`. Because it is unsigned, SmartScreen may show “Windows protected your PC” → **More info → Run anyway**.
3. Read the disclaimer, tick the acknowledgement, and continue.
4. **Prepare**:
   - **Easiest:** unzip `MatePad-11-Workspace-1.0.0.zip` and point the workspace at its `MatePad11` folder. It already contains the APatch files 10/10.
   - Or keep the default workspace and use **Tool pack → Fetch external pack** (or import the original pack).
   - Press **Download & build**. The app fetches the current GPL source, installs .NET 8 into the workspace if the PC has no SDK 8, and runs:

     ```powershell
     dotnet publish MatePadToolbox.csproj -c Release -p:Platform=x64 -r win-x64 --self-contained true -o <workspace>
     ```

   - First build commonly takes 5–15 minutes and downloads the Windows App SDK packages. Watch the log; on failure, copy it with **Console → Export diagnostics**.
   - When it finishes, **Launch toolkit** appears. The upstream app opens.

If the build fails, install the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) manually, reopen the app, and retry. The exact failing line is in the build console.

## 2. Tool pack

1. Use one of:
   - the preloaded workspace ZIP (all APatch files already placed), or
   - **Tool pack → Fetch external pack** (signed firehose/ABL, QSaharaServer, fh_loader 23.06, signed driver installer), or
   - **Tool pack → Choose ZIP/folder** with the original pack.
2. Confirm the required count for your method (APatch 10/10 or Magisk 9/9). The page names anything missing.
3. Install the drivers if Device Manager needs them: upstream **Driver** page, or `tools/driver/adbdriver.exe` / `qcdriver.exe`. In the supplied workspace both are the same Authenticode-signed Xiaomi combined installer; the original author's separate installers are preferable if you have them. A reboot may be required.
4. Optional: **Hash** a row to record its SHA-256; **Reveal** opens the file location.
5. The optional ROM/downgrade files are still not supplied: `rawprogram*`, `ptool.exe`, `vbmeta.zip`, `misc.img`, `HiSuiteProxy/*`. Unlock and APatch root do not need them.

The app auto-downloads platform-tools, 7-Zip, Magisk, APatch and KernelPatch. **Fetch external pack** adds the pinned QSaharaServer, fh_loader 23.06, the two signed images and the signed driver installer. It still never fetches `vbmeta.zip`, `rawprogram*`, `misc.img`, `ptool.exe` or HiSuite; those are only for ROM flashing/downgrade and come from the original pack or firmware.

## 3. Connect and read the tablet

1. On the tablet: Settings → About tablet → tap **Build number** 7 times. Then Developer options → **USB debugging** on. Also enable “Allow ADB debugging in charge-only mode” if it exists.
2. Connect the cable directly to the PC (no hub). Tap **Allow** on the RSA prompt.
3. In the companion: **Device → Detect tablet**. Confirm:
   - model DBY-W09,
   - HarmonyOS 2.x/3.x or 4.x,
   - battery ≥ 60%,
   - USB debugging authorized.
4. If Device Manager shows a yellow mark, install the ADB driver. If `adb devices` is empty, restart ADB in the app, close HiSuite, try another cable/port.

## 4. Full EDL backup (strongly recommended)

The upstream **9008 备份** page reads every partition except `userdata`, `last_parti`, `mindows*` and writes images + GPT/XML + `flash_all.bat`. Do this before writing the unlock ABL. Keep the backup on a second disk. The independent guide measured ~13 GB / 73 partitions on a DBY-W09.

- HarmonyOS 2/3: the toolkit can reboot to 9008 over ADB.
- HarmonyOS 4: enter 9008 with an engineering cable/test-point short first.
- First time in 9008, Windows may show `QUSB_BULK` with a warning; install the Qualcomm 9008 driver. The app's Device page shows the detected COM port.

## 5. Unlock the bootloader

### HarmonyOS 2.x / 3.x

1. In the companion: **Unlock**, read the preflight. All required items must be green.
2. Type `WIPE`, tick the backup confirmation, press **Record acknowledgement**.
3. Press **Open toolkit → Unlock BL**.
4. In the toolkit: **Unlock BL** → **HarmonyOS 2–3** → **Start**.
5. The toolkit runs `adb reboot edl`, uploads `Huawei865870_devprg.elf`, configures `fh_loader`, writes the unlock ABL to LUN 4 sector 49670, and resets. **Do not unplug.**
6. If no 9008 port appears after ~30 seconds, stop. Some global 3.x builds ignore `adb reboot edl`; use an engineering cable or downgrade to HarmonyOS 2.
7. After the reset, hold **Volume Down** while it restarts to enter fastboot. Run:

   ```text
   fastboot getvar unlocked
   ```

   Expect `unlocked: yes`.
8. In the companion press **Check bootloader state** while the tablet is in fastboot. It records the verification and enables the Root step.

### HarmonyOS 4.x

ADB cannot enter EDL on this branch. Choose one:

- **Engineering cable / test-point short**: enter 9008 first, confirm the COM port, then toolkit **Unlock BL → HarmonyOS 4 → engineering method**.
- **Downgrade**: use the toolkit's **Downgrade** page (old HiSuite + HiSuite Proxy + adjusted system time), return to HarmonyOS 2/3, then follow the ADB branch.

The HOS 4.2 write-up linked in the app is a one-device record, not a guarantee for your unit.

## 6. Root

### APatch (fewer steps)

1. In the companion: **Root**, choose **APatch**.
2. Install the manager APK (button) while the tablet is in Android.
3. Open the toolkit → **Root → APatch**. Select the matching OS branch:
   - 2/3: ADB can reboot to EDL.
   - 4: tablet must already be in 9008.
4. Run the one-click flow. It reads `boot` over 9008, runs `kptools unpack/patch/repack` with `kpimg-android`, then `fastboot flash boot`.
5. First boot: open APatch, complete activation, set/remember the SuperKey.
6. Companion **Verify root**: it runs `adb shell su -c id`; accept the SuperUser prompt. Expect `uid=0(root)`.

### Magisk (you provide the patched ramdisk)

1. Extract the **exact matching** stock ramdisk image from your firmware package. A different build can bootloop the tablet.
2. Install `Magisk.apk` from the companion.
3. On the tablet: Magisk → **Install** → **Select and Patch a File** → choose the ramdisk → wait for `magisk_patched-*.img` in Download.
4. Copy it to the PC. In the companion: **Tool pack → Add ramdisk image**. Confirm one ramdisk is present.
5. Toolkit → **Root → Magisk** → select the image → flash. It runs `fastboot flash ramdisk <image>`.
6. Companion **Verify root**: `adb shell su -c id` → `uid=0(root)`.

## 7. After root

- **Never accept an OTA or HiSuite update.** It can overwrite bootloader components and remove root.
- **Never flash the stock ABL.** It relocks the bootloader; on HarmonyOS 4 you may not get back into EDL.
- **Never relock the bootloader while a patched boot/ramdisk is installed.**
- Keep the stock boot/ramdisk and the EDL backup. To unroot, flash the stock image first.
- Install modules from inside APatch/Magisk. Read the module's requirements before rebooting.

## Troubleshooting

| Symptom | What to try |
|---|---|
| `adb devices` empty | New data cable, direct port, restart ADB in the app, close HiSuite/`hwtransport.exe`, accept the RSA prompt. |
| `unauthorized` | Unlock the tablet and tap Allow; revoke USB debugging authorizations and reconnect. |
| Device Manager shows `QUSB_BULK` with a warning | Install the Qualcomm 9008 driver from the tool pack; reboot Windows if asked. |
| No 9008 after `adb reboot edl` | Stop. Use an engineering cable/test-point short, or downgrade to HarmonyOS 2. Do not keep retrying writes. |
| EDL stops answering | Hold Power + Volume Up + Volume Down until it restarts, then hold Volume Down for fastboot. |
| Flashing hangs | Do not unplug. Check the toolkit log; the cable or port is the usual cause. |
| `fastboot getvar unlocked` says no | You are still locked. Do not root. Re-read the unlock result before another write. |
| Windows build fails | Open **Console**, export diagnostics; verify .NET 8 SDK and network; retry with a fresh source download. |
| App shows “Windows only” | You are on macOS/Linux. The build and launch steps require the Windows PC. |

## Recovery principle

Your EDL backup is the way back. If the tablet will not boot, do not start random writes. Put it in 9008 (or fastboot) and use the backup/GPT files you generated in step 4. If you never made a backup, stop and ask for help before writing anything else.
