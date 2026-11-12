# The proprietary tool pack

The companion prepares the workspace and checks every path, but it cannot supply the files the upstream author intentionally does not redistribute. You need one ZIP or folder that contains them. The importer matches files **by name**, ignores everything it does not recognize, and copies matches into the exact layout below.

## What the upstream expects

All paths are relative to the workspace (the folder that directly contains `MatePadToolbox.exe`).

```text
workspace/
├─ MatePadToolbox.exe
├─ tools/
│  ├─ adb.exe                  ← auto-download (Google platform-tools)
│  ├─ fastboot.exe             ← auto-download
│  ├─ AdbWinApi.dll            ← auto-download with platform-tools
│  ├─ AdbWinUsbApi.dll         ← auto-download
│  ├─ 7z.exe                   ← auto-download (7-Zip extra package)
│  ├─ QSaharaServer.exe        ← user tool pack
│  ├─ fh_loader.exe            ← user tool pack
│  ├─ ptool.exe                ← optional, user tool pack
│  ├─ driver/
│  │  ├─ adbdriver.exe         ← optional/recommended, user tool pack
│  │  └─ qcdriver.exe          ← optional/recommended, user tool pack
│  ├─ apatch_tools/
│  │  ├─ kptools.exe           ← auto-download (KernelPatch)
│  │  └─ kpimg-android         ← auto-download
│  ├─ apks/
│  │  ├─ Magisk.apk            ← auto-download (topjohnwu/Magisk)
│  │  └─ Apatch.apk            ← auto-download (bmax121/APatch)
│  ├─ rawprogram/              ← only for ROM flashing
│  │  ├─ rawprogram0.xml … rawprogram5.xml
│  │  ├─ rawprogram_vbmeta.xml
│  │  ├─ rawprogram_super.xml
│  │  └─ misc.img
│  └─ HiSuiteProxy/            ← only for the HOS 4 downgrade path
│     ├─ HiSuite1.exe
│     └─ HiSuite Proxy V3.exe
├─ unlock/
│  ├─ Huawei865870_devprg.elf       ← user tool pack (signed firehose)
│  └─ Huawei865870_abl_unlock.img   ← user tool pack (unlocked ABL)
├─ vbmeta/vbmeta.zip                ← only for third-party ROM flashing
└─ ramdisk/<patched>.img            ← Magisk only, produced by you
```

The companion's **Tool pack** page is a live mirror of this list. Required items for the selected root method block the unlock action; ROM-only items do not.

## One-click source (new)

The app's **Tool pack → Fetch external pack** downloads and hash-verifies the missing unlock/APatch files:

| File | Source | SHA-256 |
|---|---|---|
| `unlock/Huawei865870_devprg.elf` (signed firehose) | XDA DBY-W09 guide's public Drive folder | `a0e08a0a…adc7c9d` |
| `unlock/Huawei865870_abl_unlock.img` (unlocked ABL) | same folder | `552e96d2…3f0b79d` |
| `tools/QSaharaServer.exe` (174,592 B) | MiFlash mirror (Gitee) | `de5cd326…8561f09e` |
| `tools/fh_loader.exe` (485,888 B, 23.06 build) | OPlus EDL Toolkit | `84bec0a6…b91c5145` |
| `tools/driver/adbdriver.exe` + `qcdriver.exe` | signed Xiaomi MiFlash Unlock driver installer | `206e3065…6a3430` |

The driver installer is a **combined** ADB + Qualcomm installer substituted for the author's two separate files; both toolkit Driver buttons launch it. It is Authenticode-signed by Beijing Xiaomi. QSaharaServer and fh_loader are unsigned Qualcomm utilities; hashes are pinned and the fetcher refuses mismatches.

A ready-made workspace is also shipped as **`MatePad-11-Workspace-1.0.0.zip`**. It contains the platform-tools, 7-Zip, Magisk, APatch, KernelPatch, QSaharaServer, the 2023 fh_loader, the two signed images, and the driver installer, already in the `tools/` + `unlock/` layout. Build the toolkit into it on Windows; no import is required.

## Source rules

- **Use the pack that came with the original toolkit** (the author's distribution) when possible. That is the intended source.
- Do not use random file-hosting reuploads. The unlock files are signed and device-specific; a wrong file can brick the tablet.
- Qualcomm **QPST** contains `QSaharaServer.exe` and `fh_loader.exe`. Use it only if you are entitled to it under Qualcomm's terms, or take the copies from the original pack.
- The signed **firehose** and **unlock ABL** are Huawei-signed and device-specific. The independent HOS 4.2 write-up links a Drive folder with two files it used on one DBY-W09:

| File in that folder | Size | SHA-256 (as published there) | Rename to |
|---|---:|---|---|
| `dbyprog_emmc_firehose` | 697,648 B | `a0e08a0a26b1356e04fb3b3097c70237a2e3e0861dbd1a99cafbab4f5adc7c9d` | `unlock/Huawei865870_devprg.elf` |
| `abl_hw865870unlock.elf` | 602,112 B | `552e96d2565627563b7f2b072f720efd048abdf11fa050959aec55e7d3f0b79d` | `unlock/Huawei865870_abl_unlock.img` |

Source for those hashes and links: <https://github.com/serkanvela/matepad11-hos42-root-gms> (independent, one-device result, not the upstream author). Verify the size and hash yourself before use. The companion records hashes of imported files but does not assert that a file is authentic.

- Drivers: the original pack's `driver/adbdriver.exe` and `driver/qcdriver.exe`, or an equivalent Huawei/Qualcomm driver you already trust. Windows Update sometimes installs a working ADB driver.
- `vbmeta.zip`, `rawprogram*`, `misc.img`: only needed for ROM flashing/rescue, not for unlock/root. Take them from the original pack or the matching firmware package.
- `HiSuite1.exe` and `HiSuite Proxy V3.exe`: only for downgrading HarmonyOS 4. Optional.
- `rawprogram*`, `vbmeta.zip`, `misc.img`, `ptool.exe`: only for ROM flashing/rescue. `ptool` can generate rawprogram files from a 9008 backup; `vbmeta.zip` is firmware-specific. The ready workspace intentionally omits these.

## The importer

**Tool pack → Import** accepts:

- a ZIP (it is extracted to a temporary folder and scanned),
- a folder (recursively scanned, symlinks rejected),
- a single `.img` via **Add ramdisk image** (any filename, copied to `ramdisk/`).

What it does:

1. Walks the pack and matches known basenames case-insensitively (e.g. `tools/7z.exe`, `anything/QSaharaServer.exe`, `kptools-x86_64-win.exe`, `Magisk-v31.1.apk`, `APatch_*.apk`).
2. Copies each match to the canonical path, backing up an existing file first.
3. Records SHA-256 and size in the app state.
4. Reports copied, replaced, ignored, ambiguous names and the remaining missing requirements.

It only copies recognized files. A README or checksum file in the pack is ignored. If a name is ambiguous, the shortest path wins and the app reports it.

## After importing

Use **Tool pack → Rescan** and confirm the required count for your method:

- APatch: 10 required files.
- Magisk: 9 required files (includes one patched ramdisk).

If a required file is still missing, the unlock button stays disabled and the page names it.
