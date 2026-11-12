# Third-party notices

MatePad 11 Companion is MIT-licensed. It does not bundle the upstream toolkit,
the proprietary device files, or the downloaded tools.

## Runtime and libraries in this build

- **Electron 33.4.11** — MIT. Chromium and other Electron components retain their
  own licenses; the packaged app includes Electron's `LICENSE` and
  `LICENSES.chromium.html`.
- **adm-zip 0.5.18** — MIT. Used for safe ZIP extraction in the main process.
- **Node.js / Chromium runtime** — bundled by Electron.

## Downloaded at runtime (not distributed with this app)

- **MatePad11_Tool_Kit_GUI** — GPL-3.0-or-later, © its author. The app downloads
  the source from <https://github.com/run2000s/MatePad11_Tool_Kit_GUI> and builds
  it locally with the user's .NET SDK. The built `MatePadToolbox.exe` is not
  included in this repository or package.
- **Android platform-tools** — Google, downloaded from
  <https://dl.google.com/android/repository/platform-tools-latest-windows.zip>
  under the Android SDK terms.
- **7-Zip** — Igor Pavlov, LGPL-2.1-or-later with the unRAR restriction;
  downloaded from <https://www.7-zip.org/>. The app extracts `7za.exe`.
- **Magisk** — GPL-3.0, © topjohnwu; downloaded from the official GitHub releases.
- **APatch** — GPL-3.0, © bmax121; downloaded from the official GitHub releases.
- **KernelPatch** — GPL-2.0, © bmax121; `kpimg-android` and the Windows `kptools`
  archive are downloaded from the official GitHub releases.

## User-supplied, proprietary (never downloaded by this app)

- Qualcomm `QSaharaServer.exe`, `fh_loader.exe`, `ptool.exe`, drivers (QPST).
- Huawei-signed firehose programmer and unlock ABL, HiSuite, `vbmeta.zip`,
  `rawprogram*.xml`, `misc.img`, and any firmware images.
- The original toolkit's tool pack, if distributed by its author.

These are used at the user's discretion and remain subject to their owners'
terms. No warranty is provided for them.

## Trademarks

Huawei, MatePad, HarmonyOS, Qualcomm, Snapdragon, Android, Magisk, APatch,
KernelPatch, 7-Zip, and Electron are trademarks of their respective owners.
This project is not affiliated with or endorsed by any of them.
