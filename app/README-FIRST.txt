MatePad 11 Companion 1.0.0 — Windows x64
=========================================

1. Unzip this folder somewhere writable (not Program Files).
2. Run "MatePad 11 Companion.exe".
   If Windows SmartScreen appears: More info -> Run anyway. The build is
   unsigned, so Windows does not know the publisher.
3. Prepare -> Download & build. The app installs .NET 8 locally if needed and
   builds the upstream GPL toolkit. First build: 5-15 minutes.
4. Tool pack -> import the proprietary pack you got with the original toolkit.
   The app does NOT contain QSaharaServer, fh_loader, drivers, unlock images,
   vbmeta, or rawprogram files, and it never downloads them from mirrors.
5. Connect the DBY-W09 with USB debugging on -> Device -> Detect tablet.
6. Unlock: type WIPE, acknowledge the backup, open the toolkit, follow the
   branch. Verify "fastboot getvar unlocked" -> yes.
7. Root: APatch (automated) or Magisk (patched ramdisk you supply).

Read docs/WINDOWS-RUNBOOK.md before writing anything. Unlocking erases all
data and can hard-brick the tablet. No warranty. Not affiliated with Huawei,
Qualcomm, or the upstream author.

The actual EDL/9008 writes are done by the upstream MatePadToolbox, not by
this companion. This companion prepares, verifies, gates, and guides.
