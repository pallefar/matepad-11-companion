# Getting into EDL and downgrading

## If 9008 never appears

### 1. Check the installed driver, not just the port

**Device → System check → Windows drivers → Qualcomm 9008 driver** now reports the installed driver package even when the tablet is not in EDL.

- **Driver installed** — the QDLoader package is present. The 9008 port will appear only when the tablet actually enters EDL.
- **Driver missing** — install `tools/driver/qcdriver.exe` from the EDL card (approve UAC), then rescan.

The EDL card also has **Try ADB EDL**, **Install QC driver**, **Device Manager** and **Rescan**.

### 2. Check the HarmonyOS branch

- **HarmonyOS 2/3** — `adb reboot edl` is the supported route. Use the button, then watch for `QUSB_BULK` / `Qualcomm HS-USB QDLoader 9008`.
- **HarmonyOS 4** — ADB EDL is blocked. Use an engineering cable/test-point short or the toolkit's downgrade page. Do not keep retrying writes.
- **Unknown** — refresh Device first; do not guess.

### 3. If ADB EDL fails

1. Unplug the tablet, close HiSuite and any other ADB client.
2. Use the EDL cable, or the documented test-point method for DBY-W09. Do not short random pads.
3. Try another USB data cable and a rear/root USB port.
4. Open **Device Manager**; look under **Ports** and **Other devices** for `QUSB_BULK`, `QDLoader 9008`, or a warning icon.
5. Install the Qualcomm driver, unplug/replug, and rescan.
6. Confirm Device Manager shows **Qualcomm HS-USB QDLoader 9008 (COMx)** before starting a write.

The driver check only proves the package is installed. It cannot force the tablet into EDL.

## Downgrade HarmonyOS 4 → 2/3

The upstream toolkit has a downgrade page; the companion's **Unlock → Downgrade HarmonyOS** card links to it. The companion does **not** bundle firmware and does not automate a downgrade.

1. Back up the tablet; downgrade erases data.
2. Use **HiSuite + HiSuite Proxy** or a matching **DBY-W09 dload** firmware. Never use DBY2, LTE, or another model's package.
3. Complete the downgrade and re-enable Developer options / USB debugging.
4. Refresh Device here and confirm **HarmonyOS 2.x or 3.x** before unlocking.

Wrong firmware can hard-brick the tablet. There is no generic safe package.

## Backup gate override

**Unlock → Unlock without an EDL backup** lets you proceed with the literal phrase `NO BACKUP` and a risk checkbox. This is an explicit override, not a backup. No recovery image exists if the tablet bricks. Use it only when you accept that risk.
