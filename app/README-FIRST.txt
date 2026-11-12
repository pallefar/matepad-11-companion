MatePad 11 Companion 1.1.0 — Windows x64
=========================================

1. Unzip this folder somewhere writable (not Program Files).
2. Run "MatePad 11 Companion.exe".
   If Windows SmartScreen appears: More info -> Run anyway. The build is
   unsigned, so Windows does not know the publisher.
3. Prepare -> Download & build. The app installs .NET 8 locally if needed and
   builds the upstream GPL toolkit. First build: 5-15 minutes.
   The sun/moon icon in the top bar switches light/dark mode; the choice is
   remembered locally. Settings -> Appearance has the same control.
4. Tool pack. Two options:
   a) Use the supplied "MatePad-11-Workspace-1.0.0.zip". Extract it, and in
      Prepare select its MatePad11 folder as the workspace. The tool pack is
      already complete (APatch 10/10) and the toolkit will build into it.
   b) Use a fresh workspace and press "Fetch external pack". It downloads the
      signed firehose/ABL from the independent guide's Drive folder, QSaharaServer,
      a 2023 fh_loader, and a signed driver installer, with pinned hashes.
   The app still never bundles these files in its own package.
5. Connect the DBY-W09 with USB debugging on -> Device -> Detect tablet.
6. Unlock: type WIPE, acknowledge the backup, open the toolkit, follow the
   branch. Verify "fastboot getvar unlocked" -> yes.
7. Root: APatch (automated) or Magisk (patched ramdisk you supply).

Read docs/WINDOWS-RUNBOOK.md before writing anything. Unlocking erases all
data and can hard-brick the tablet. No warranty. Not affiliated with Huawei,
Qualcomm, or the upstream author.

The actual EDL/9008 writes are done by the upstream MatePadToolbox, not by
this companion. This companion prepares, verifies, gates, and guides.
