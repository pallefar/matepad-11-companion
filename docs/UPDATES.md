# App updates

The companion can check GitHub for a newer release and, in the packaged Windows build, download and replace itself.

## What it does

1. **Check** — calls `https://api.github.com/repos/pallefar/matepad-11-companion/releases/latest`.
2. **Compare** — parses `vX.Y.Z` and compares it with the installed app version.
3. **Download** — finds the release asset named `MatePad-11-Companion-<version>-win-x64.zip`.
4. **Verify** — checks the SHA-256 from GitHub's asset digest, falling back to the release's `.sha256` asset.
5. **Install (Windows portable only)** — starts a PowerShell helper, closes the app, renames the old app folder to a backup, moves the new folder into place, restarts the app, then removes the backup. If the swap fails, it restores the old folder and restarts it.
6. **Report** — a failure is logged to `%TEMP%\matepad-update.log`; the next launch uses the old app.

The update is explicit: **Check for updates** then **Download & install**. Nothing downloads silently.

## Where to find it

**Settings → App updates** shows:

- current version
- latest release
- last check
- Check for updates
- Download & install when a newer release exists

The **Settings** nav item gets an `↑` badge while an update is available, and Overview shows an update notice.

## Limits and safety

- **Windows portable only** for self-replacement. The app cannot replace itself on macOS; Mac users get the release-page link. Development (`npm start`) is also link-only.
- The app must live in a **writable folder**, not `Program Files`, and the **workspace must be outside the app folder**. User data is in `%APPDATA%`, so it is untouched.
- The release is **unsigned**. The updater verifies SHA-256 from GitHub, but that is not a code signature.
- If the app folder is read-only, the helper cannot swap it and will restore/restart the old app.
- GitHub API rate limits apply; an error is non-fatal and can be retried.
- The helper is Windows PowerShell 5 (`Expand-Archive`, `Move-Item`); Windows 10/11 provide it.

## Publishing a new update

1. Bump the app version in `app/package.json` and `app/main.js`.
2. Build the Windows ZIP with the exact name `MatePad-11-Companion-<version>-win-x64.zip`.
3. Attach it and the `.sha256` to a published GitHub release. Mark it latest.
4. The installed app will see it on the next check. The first install of the updater must be manual, because older builds do not have this feature.

## Manual recovery

If the app does not come back after an update:

1. Open `%TEMP%\matepad-update.log`.
2. Look for a `.backup-*` folder next to the app folder.
3. If present, close any running app and rename the `.backup-*` folder back to the app folder, or download the release ZIP manually and replace the folder.
4. Your workspace and `%APPDATA%` state are separate.

## Testing status

The version/asset/hash logic and UI are unit/E2E tested. The actual Windows PowerShell swap and restart **have not been run on a Windows machine** in this session; treat the first real update as the validation step.
