# Support session and debug reports

The app can keep a **support-session URL** and open it in the default browser, and it can copy a debug report to the clipboard.

## Where it lives

- **Settings → Support session**
- the **? button in the top-right corner**
- **Guide → Need help?**

Set the link in Settings and press **Save link**. When configured, the top-right support button opens it directly. With no link, it takes you to the support field.

## The localhost limitation

This DSH session is running on the Mac at:

`http://127.0.0.1:52188`

That link works only on the Mac that is running this session. On a Windows PC, `127.0.0.1` is the PC itself, so a hardcoded localhost link would open nothing.

For a Windows app to reach this Mac session, use a secure, authenticated route:

- **Tailscale Serve** to `127.0.0.1:52188` on the Mac, then paste the generated `https://…ts.net` URL into the app; or
- Cloudflare Access / another authenticated tunnel.

Do **not** expose the DSH GUI on an unauthenticated public tunnel. It can control the session and its tools.

On this Mac, launching the app from a DSH shell can auto-fill the link from `DSH_WEB_URL`. A packaged Mac app launched from Finder has no environment, so paste it manually.

## Debug report

**Copy debug report** copies:

- app name/version and host platform
- demo vs live, current view and current guide step
- workspace path
- device model/state/HarmonyOS/battery (no serial)
- tool-pack counts and gate statuses
- system-check tool/driver/phone/manager-app statuses
- update current/latest/available/last checked
- the last 30 warning/error log lines

No telemetry is sent automatically. The report stays on the clipboard until you paste it into the support session or a GitHub issue. Review it before sharing; it may contain paths.

## Intended workflow

1. Set the support link once (Mac localhost or a secure tunnel URL).
2. When a Windows step fails, press the top-right support button.
3. Use **Copy debug report** or **Export diagnostics** in the app.
4. Paste the report into the live session or a GitHub issue.

This is a deliberate, supported alternative to embedding the chat: no unauthenticated exposure and no hardcoded Mac localhost in the Windows build.
