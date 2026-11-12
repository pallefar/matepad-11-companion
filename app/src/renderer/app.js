import { icon } from './icons.js';
import {
  makeT,
  pick,
  PROCEDURE,
  ITEM_NOTES_ZH,
  GROUP_LABELS_ZH,
  GROUP_DESC_ZH,
} from './i18n.js';

const api = window.companion;
const VIEWS = ['overview', 'prepare', 'tools', 'device', 'unlock', 'root', 'console', 'settings'];

const state = {
  snapshot: null,
  view: 'overview',
  lang: 'en',
  t: makeT('en'),
  imports: null,
  downloads: {},
  buildProgress: null,
  buildBusy: false,
  consoleFilter: 'all',
  consoleQuery: '',
  autoscroll: true,
  wipePhrase: '',
  wipeBackup: false,
  forceSource: false,
  scroll: {},
  disclaimerPrompted: false,
  modalOpen: false,
  justNavigated: false,
  logCache: [],
  copyTimer: null,
  shellReady: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inline(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function fmtBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value === 0) return '0';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[index]}`;
}

function fmtGb(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(state.lang === 'zh' ? 'zh-CN' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusMeta(status) {
  switch (status) {
    case 'ready':
    case 'pass':
      return { icon: 'check', tone: 'good', key: status === 'pass' ? 'common.pass' : 'common.ready' };
    case 'attention':
    case 'warn':
      return { icon: 'alert', tone: 'warn', key: status === 'warn' ? 'common.warn' : 'common.attention' };
    case 'blocked':
    case 'fail':
      return { icon: 'x', tone: 'bad', key: status === 'fail' ? 'common.fail' : 'common.blocked' };
    default:
      return { icon: 'clock', tone: 'muted', key: status === 'pending' ? 'common.pending' : 'common.unknown' };
  }
}

function statusIcon(status) {
  const meta = statusMeta(status);
  return `<span class="status-icon" data-status="${esc(status)}">${icon(meta.icon)}</span>`;
}

function statusText(status) {
  const meta = statusMeta(status);
  return `<span class="status" data-status="${esc(status)}"><span class="dot ${meta.tone === 'muted' ? '' : meta.tone}"></span>${esc(state.t(meta.key))}</span>`;
}

function chip(text, tone = '') {
  return `<span class="chip ${tone ? `is-${tone}` : ''}">${text}</span>`;
}

function badge(text, tone = '') {
  return `<span class="badge ${tone ? `is-${tone}` : ''}">${esc(text)}</span>`;
}

function button(label, action, opts = {}) {
  const {
    tone = '',
    iconName = '',
    data = {},
    disabled = false,
    size = '',
    title = '',
    type = 'button',
    extra = '',
  } = opts;
  const dataAttrs = Object.entries(data)
    .map(([key, value]) => ` data-${esc(key)}="${esc(value)}"`)
    .join('');
  return `<button type="${type}" class="btn ${tone} ${size}" data-action="${esc(action)}"${dataAttrs}${
    disabled ? ' disabled' : ''
  }${title ? ` title="${esc(title)}"` : ''}${extra ? ` ${extra}` : ''}>${iconName ? icon(iconName) : ''}${esc(label)}</button>`;
}

function linkButton(label, href, opts = {}) {
  return `<button class="btn ${opts.tone || 'btn-ghost'} ${opts.size || ''}" data-external="${esc(href)}">${esc(label)}${
    opts.arrow ? icon('external') : ''
  }</button>`;
}

function pageHead({ eyebrow, title, lede, actions = '' }) {
  return `<header class="page-head">
    <div class="page-head-main">
      <div class="eyebrow">${eyebrow}</div>
      <h1 id="view-title" tabindex="-1">${title}</h1>
      <p class="lede">${lede}</p>
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

function cardTitle(iconName, label, right = '') {
  return `<div class="card-head"><div class="card-title">${icon(iconName)}${esc(label)}</div>${right}</div>`;
}

function notice(text, tone = 'info', iconName = 'info', action = '') {
  return `<div class="notice ${tone}">${icon(iconName)}<div>${text}</div>${action}</div>`;
}

function emptyState(iconName, title, text, actions = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

function currentStepLabels() {
  return state.snapshot?.readiness?.steps || [];
}

function stepLabel(step) {
  return state.t(`steps.${step.id}`) || step.label;
}

function localRoute() {
  const route = state.snapshot.route || {};
  const t = state.t;
  if (route.route === 'already-unlocked') {
    return { title: t('unlock.verifiedUnlocked'), detail: t('unlock.routeAlreadyDetail') };
  }
  if (route.route === 'adb-edl') {
    return { title: t('unlock.routeAdbTitle'), detail: t('unlock.routeAdbDetail') };
  }
  if (route.route === 'engineering') {
    return { title: t('unlock.routeEngineeringTitle'), detail: t('unlock.routeEngineeringDetail') };
  }
  return { title: t('unlock.routeUnknownTitle'), detail: t('unlock.routeUnknownDetail') };
}

function localStepDetail(step) {
  const snap = state.snapshot;
  const t = state.t;
  switch (step.id) {
    case 'pc':
      if (!snap.env.isWindows) return t('prepare.windowsOnlyText');
      return `${snap.env.platformLabel} · ${snap.env.arch} · ${fmtGb(snap.env.freeBytes)}`;
    case 'toolkit':
      return snap.env.toolkit?.present ? t('prepare.toolkitReady') : t('prepare.notBuilt');
    case 'toolpack': {
      const inv = snap.inventory;
      return inv
        ? `${inv.requiredPresent} / ${inv.requiredCount} ${t('common.required').toLowerCase()}`
        : t('common.loading');
    }
    case 'device': {
      const device = snap.device;
      if (!device) return t('overview.noDeviceNote');
      if (device.state === 'unauthorized') return t('device.unauthorized');
      if (device.state !== 'device') return t('device.noText');
      return `${device.model || 'DBY-W09'} · HarmonyOS ${device.os?.version || '?'} · ${
        device.battery?.level != null ? `${device.battery.level}%` : t('common.unknownValue')
      }`;
    }
    case 'unlock':
      return snap.readiness.unlocked ? t('unlock.verifiedUnlocked') : t('unlock.notVerified');
    case 'root':
      return snap.readiness.rooted ? t('root.verified') : t('root.notVerified');
    default:
      return step.detail;
  }
}

/* ============================ boot & rendering ============================ */

async function boot() {
  if (!api) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">Preload API unavailable.</div>';
    return;
  }
  api.onEvent(handleEvent);
  try {
    const initial = await api.bootstrap();
    if (initial && initial.app) {
      state.snapshot = initial;
      state.logCache = initial.logs || [];
    } else {
      state.snapshot = await api.snapshot();
      state.logCache = state.snapshot?.logs || [];
    }
  } catch (error) {
    console.error(error);
  }
  state.lang = state.snapshot?.state?.language || 'en';
  state.t = makeT(state.lang);
  renderShellBase();
  render({ preserveScroll: false });
  if (state.snapshot && !state.snapshot.state.acknowledgements.disclaimer && !state.disclaimerPrompted) {
    state.disclaimerPrompted = true;
    setTimeout(showDisclaimer, 220);
  }
  window.__companionReady = true;
  window.__companionSetView = (nextView) => {
    if (!VIEWS.includes(nextView)) return;
    state.view = nextView;
    state.justNavigated = true;
    render({ preserveScroll: false, focus: false });
    $('#scroller').scrollTop = 0;
  };
}

function renderShellBase() {
  const app = $('#app');
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${icon('logo')}</div>
        <div>
          <div class="brand-name">MatePad 11<br>Companion</div>
          <div class="brand-sub">DBY-W09 · SD865</div>
        </div>
      </div>
      <nav class="nav" id="nav" aria-label="Primary"></nav>
      <div class="sidebar-foot" id="sidebar-foot"></div>
    </aside>
    <div class="main">
      <header class="topbar" id="topbar"></header>
      <div id="demo-strip"></div>
      <div class="main-scroll" id="scroller">
        <main class="view" id="view" tabindex="-1"></main>
      </div>
    </div>
  </div>
  <div id="toast-root" role="status" aria-live="polite" aria-atomic="false"></div>
  <dialog id="modal" class="modal"></dialog>
  <div id="drop-overlay"><div class="drop-card">${icon('package')}<h2>Drop the tool pack</h2><p>ZIP, folder, or a single image</p></div></div>`;

  state.shellReady = true;
  $('#scroller').addEventListener('scroll', () => {
    state.scroll[state.view] = $('#scroller').scrollTop;
  });
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);
  $('#modal').addEventListener('close', () => {
    state.modalOpen = false;
    $('#modal').innerHTML = '';
  });
  setupDropzone();
}

function render({ preserveScroll = true, focus = false } = {}) {
  if (!state.snapshot || !state.shellReady) return;
  const snap = state.snapshot;
  state.lang = snap.state.language || 'en';
  state.t = makeT(state.lang);
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  const scroller = $('#scroller');
  const prevTop = scroller?.scrollTop || 0;
  renderChrome();
  const view = $('#view');
  view.innerHTML = viewMarkup();
  if (state.justNavigated) {
    state.justNavigated = false;
    scroller.scrollTop = 0;
  } else if (preserveScroll) {
    scroller.scrollTop = prevTop;
  }
  if (focus) {
    const title = $('#view-title');
    if (title) title.focus({ preventScroll: true });
  }
  if (state.view === 'console') {
    requestAnimationFrame(() => {
      const body = $('#console-body');
      if (body && state.autoscroll) body.scrollTop = body.scrollHeight;
    });
  }
}

function renderChrome() {
  const snap = state.snapshot;
  const t = state.t;
  const steps = currentStepLabels();
  const missing = snap.inventory?.requiredMissing?.length || 0;
  const navGroups = [
    {
      label: t('nav.group.procedure'),
      items: [
        ['overview', 'overview'],
        ['prepare', 'prepare'],
        ['tools', 'tools'],
        ['device', 'device'],
        ['unlock', 'unlock'],
        ['root', 'root'],
      ],
    },
    {
      label: t('nav.group.system'),
      items: [
        ['console', 'console'],
        ['settings', 'settings'],
      ],
    },
  ];
  $('#nav').innerHTML = navGroups
    .map(
      (group) => `<div class="nav-label">${esc(group.label)}</div>
        ${group.items
          .map(([id, iconName]) => {
            const step = steps.find((entry) => entry.id === id);
            let badge = '';
            if (id === 'tools' && missing > 0) {
              badge = `<span class="nav-badge is-warn">${missing}</span>`;
            } else if (id === 'device' && snap.device?.state === 'device') {
              badge = '<span class="dot good"></span>';
            } else if (id === 'unlock' && snap.readiness.unlocked) {
              badge = `<span class="nav-badge">✓</span>`;
            } else if (id === 'root' && snap.readiness.rooted) {
              badge = `<span class="nav-badge">✓</span>`;
            } else if (step && ['blocked', 'attention'].includes(step.status) && !['overview', 'device'].includes(id)) {
              badge = `<span class="nav-badge is-bad">!</span>`;
            }
            return `<button class="nav-item ${state.view === id ? 'is-active' : ''}" data-nav="${id}" ${
              state.view === id ? 'aria-current="page"' : ''
            }>${icon(iconName)}<span class="nav-text">${esc(t(`nav.${id}`))}</span>${badge}</button>`;
          })
          .join('')}`,
    )
    .join('');

  const demo = snap.demo;
  $('#sidebar-foot').innerHTML = `
    <div class="side-status">
      <span class="dot ${snap.env.isWindows ? 'good' : 'warn'}"></span>
      <span>${esc(snap.env.isWindows ? snap.env.platformLabel : t('common.windowsOnly'))}</span>
    </div>
    <div class="side-actions">
      <button class="side-action" data-action="set-language" data-value="${snap.state.language === 'en' ? 'zh' : 'en'}">
        ${icon('file')}${snap.state.language === 'en' ? '中文' : 'EN'}
      </button>
      <button class="side-action" data-nav="settings" title="${esc(t('nav.settings'))}">${icon('settings')}</button>
    </div>`;

  const device = snap.device;
  const deviceChip = device?.state === 'device'
    ? `<button class="chip is-good" data-nav="device" title="${esc(t('topbar.connected'))}"><span class="dot good"></span>${esc(
        device.model || 'DBY-W09',
      )}<span class="mono">${esc(device.os?.version || '')}</span></button>`
    : `<button class="chip ${device?.state === 'unauthorized' ? 'is-warn' : ''}" data-nav="device"><span class="dot ${
        device?.state === 'unauthorized' ? 'warn' : ''
      }"></span>${esc(t('topbar.noDevice'))}</button>`;

  $('#topbar').innerHTML = `
    <div class="crumbs"><strong>MatePad 11 Companion</strong><span>/</span><span>${esc(t(`nav.${state.view}`))}</span></div>
    <div class="topbar-spacer"></div>
    <button class="chip" data-nav="prepare" title="${esc(snap.state.workspace)}">
      ${icon('folder')}<span class="mono">${esc(snap.state.workspace)}</span>
    </button>
    ${demo ? `<span class="chip is-demo">${icon('eye')}${esc(t('topbar.demo'))}</span>` : ''}
    ${deviceChip}
    <button class="icon-btn" data-nav="console" title="${esc(t('topbar.console'))}">${icon('console')}</button>`;

  $('#demo-strip').innerHTML = demo
    ? `<div class="demo-strip"><strong>${esc(t('topbar.demo'))}</strong><span>${esc(
        state.lang === 'zh'
          ? '当前为模拟设备与模拟 Windows 状态，不会执行任何设备命令。'
          : 'Simulated tablet and Windows state. No device commands are executed.',
      )}</span><span class="spacer"></span><button data-action="set-demo" data-value="false">${esc(t('overview.exitDemo'))}</button></div>`
    : '';
}

function viewMarkup() {
  switch (state.view) {
    case 'prepare':
      return prepareView();
    case 'tools':
      return toolsView();
    case 'device':
      return deviceView();
    case 'unlock':
      return unlockView();
    case 'root':
      return rootView();
    case 'console':
      return consoleView();
    case 'settings':
      return settingsView();
    default:
      return overviewView();
  }
}

/* ============================ overview ============================ */

function overviewView() {
  const snap = state.snapshot;
  const t = state.t;
  const readiness = snap.readiness;
  const next = readiness.nextStep;
  const nextLabel = next ? stepLabel(next) : t('steps.unlock');
  const device = snap.device;
  const inv = snap.inventory;
  const ack = snap.state.acknowledgements.disclaimer;

  const phaseRows = readiness.steps
    .map(
      (step, index) => `<button class="phase" data-status="${esc(step.status)}" data-nav="${esc(step.view)}">
        <span class="phase-num">${String(index + 1).padStart(2, '0')}</span>
        <span class="phase-body">
          <span class="phase-title">${esc(stepLabel(step))}</span>
          <span class="phase-detail">${esc(localStepDetail(step))}</span>
        </span>
        <span class="phase-status">${statusText(step.status)}</span>
      </button>`,
    )
    .join('');

  const deviceCard = device?.state === 'device'
    ? `<div class="device-mini">
        <div class="device-glyph">${icon('device')}</div>
        <div class="device-mini-copy">
          <div class="device-mini-name">${esc(device.model || 'DBY-W09')}</div>
          <div class="device-mini-sub">HarmonyOS ${esc(device.os?.version || '?')} · ${esc(
            device.battery?.level != null ? `${device.battery.level}%` : '—',
          )}</div>
        </div>
        <span class="badge is-good">${esc(t('topbar.connected'))}</span>
      </div>
      <div class="divider"></div>
      <dl class="kv">
        <dt>${esc(t('device.bootloader'))}</dt><dd>${esc(
          device.bootloader?.unlocked === true ? t('device.unlocked') : device.bootloader?.unlocked === false ? t('device.locked') : t('device.notChecked'),
        )}</dd>
        <dt>${esc(t('device.root'))}</dt><dd>${esc(device.rootVerified ? t('root.verified') : t('root.notVerified'))}</dd>
        <dt>${esc(t('device.storage'))}</dt><dd>${fmtGb(device.storage?.freeBytes)} ${esc(t('common.freeSpace'))}</dd>
      </dl>
      <div class="mt-12">${button(t('common.refresh'), 'refresh-device', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' })}</div>`
    : `<div class="device-mini">
        <div class="device-glyph">${icon('device')}</div>
        <div class="device-mini-copy">
          <div class="device-mini-name">${esc(t('overview.noDevice'))}</div>
          <div class="device-mini-sub">${esc(t('overview.noDeviceNote'))}</div>
        </div>
      </div>
      <div class="mt-12">${button(t('overview.connectDetect'), 'refresh-device', { tone: 'btn-primary', size: 'btn-sm', iconName: 'usb', disabled: snap.demo })}</div>`;

  const dotnet = snap.env.dotnet;
  const envCard = `<div class="env-list">
    <div class="env-row"><span class="label">${esc(t('prepare.windows'))}</span><span class="value"><strong>${esc(
      snap.env.isWindows ? snap.env.platformLabel : t('common.windowsOnly'),
    )}</strong></span></div>
    <div class="env-row"><span class="label">${esc(t('prepare.dotnet'))}</span><span class="value">${
      dotnet?.has8 ? `<strong>${esc(dotnet.versions.find((v) => v.startsWith('8.')) || '8.x')}</strong>` : esc(t('prepare.dotnetMissing'))
    }</span></div>
    <div class="env-row"><span class="label">${esc(t('overview.workspace'))}</span><span class="value mono" title="${esc(
      snap.state.workspace,
    )}">${esc(snap.state.workspace)}</span></div>
    <div class="env-row"><span class="label">${esc(t('overview.toolkit'))}</span><span class="value">${
      snap.env.toolkit?.present ? `<strong>${esc(t('common.ready'))}</strong>` : esc(t('prepare.notBuilt'))
    }</span></div>
    <div class="env-row"><span class="label">${esc(t('overview.freeSpace'))}</span><span class="value">${fmtGb(snap.env.freeBytes)}</span></div>
  </div>`;

  const demoCard = !snap.env.isWindows && !snap.demo
    ? `<div class="card flat" style="border-style:dashed">
        <div class="row-between">
          <div><div class="card-title">${icon('eye')}${esc(t('overview.demoTitle'))}</div>
          <p class="small muted mt-8" style="max-width:520px">${esc(t('overview.demoText'))}</p></div>
          ${button(t('overview.demoButton'), 'set-demo', { tone: 'btn-ghost', data: { value: 'true' }, iconName: 'play' })}
        </div>
      </div>`
    : '';

  return `
    ${pageHead({
      eyebrow: `${esc(t('overview.eyebrow'))}`,
      title: esc(t('overview.title')),
      lede: esc(t('overview.lede')),
      actions: `<button class="btn btn-primary" data-nav="${esc(next?.view || 'prepare')}">${icon('arrowRight')}${esc(
        t('overview.primary', { step: nextLabel }),
      )}</button><button class="btn btn-ghost" data-nav="console">${icon('console')}${esc(t('overview.secondary'))}</button>`,
    })}
    ${
      !ack
        ? `<div class="risk-banner mt-20">
            <div class="risk-icon">${icon('alert')}</div>
            <div><h3>${esc(t('modal.disclaimer.title'))}</h3><p>${esc(t('modal.disclaimer.item2'))}</p></div>
            ${button(t('modal.disclaimer.eyebrow'), 'open-disclaimer', { tone: 'btn-danger', size: 'btn-sm', iconName: 'shield' })}
          </div>`
        : ''
    }
    <section class="flight">
      <div class="card phase-panel">
        <div class="card-head">
          <div><div class="card-title">${icon('layers')}${esc(t('overview.flight'))}</div><div class="small dim mt-8">${esc(t('overview.flightHint'))}</div></div>
          <span class="mono dim small">${readiness.readyCount}/${readiness.total}</span>
        </div>
        <div class="phase-list">${phaseRows}</div>
      </div>
      <aside class="next-card">
        <div class="micro">${esc(t('overview.nextAction'))}</div>
        <h3>${esc(nextLabel)}</h3>
        <p>${esc(localStepDetail(next))}</p>
        <div class="mini-gates mt-16">${['toolpack', 'backup', 'battery']
          .map((id) => snap.gates.gates.find((gate) => gate.id === id))
          .filter(Boolean)
          .map(
            (gate) => `<div class="mini-gate">${statusIcon(gate.status)}<span>${esc(gateLabel(gate.id))}</span><span class="grow"></span>${statusText(gate.status)}</div>`,
          )
          .join('')}</div>
        <div class="spacer"></div>
        <div class="row" style="gap:14px;margin-bottom:14px">
          <div class="ring" style="--p:${readiness.percent};width:80px;height:80px">
            <div class="ring-inner"><div class="ring-num" style="font-size:19px">${readiness.percent}<span>%</span></div><div class="ring-label">${esc(t('overview.readiness'))}</div></div>
          </div>
          <div class="ring-copy"><strong>${esc(t('overview.checks', { ready: readiness.readyCount, total: readiness.total }))}</strong><span>${esc(
            t('overview.flightHint'),
          )}</span></div>
        </div>
        <button class="btn btn-primary" data-nav="${esc(next?.view || 'prepare')}">${icon('arrowRight')}${esc(
          t('overview.goTo', { step: nextLabel }),
        )}</button>
      </aside>
    </section>

    <section class="section two-col">
      <div class="card stat-card">
        <div class="card-head"><div class="card-title">${icon('device')}${esc(t('overview.tablet'))}</div>${device?.state === 'device' ? badge(t('topbar.connected'), 'good') : badge(t('common.pending'))}</div>
        ${deviceCard}
      </div>
      <div class="card stat-card">
        <div class="card-head"><div class="card-title">${icon('prepare')}${esc(t('overview.thisPc'))}</div><button class="btn btn-quiet btn-sm" data-nav="prepare">${esc(t('nav.prepare'))} ${icon('chevron')}</button></div>
        ${envCard}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${esc(t('overview.pathsTitle'))}</h2><p>${esc(t('overview.pathsLede'))}</p></div></div>
      <div class="path-cards">
        <div class="card path-card">
          <h3>${esc(t('overview.hos23.title'))} ${badge(t('overview.hos23.badge'), 'is-warn')}</h3>
          <p>${esc(t('overview.hos23.text'))}</p>
          <div class="path-foot"><span class="path-route">${icon('usb')}ADB → 9008</span><span class="spacer" style="flex:1"></span><button class="btn btn-ghost btn-sm" data-nav="unlock">${esc(t('overview.readSteps'))}</button></div>
        </div>
        <div class="card path-card os4">
          <h3>${esc(t('overview.hos4.title'))} ${badge(t('overview.hos4.badge'), 'is-warn')}</h3>
          <p>${esc(t('overview.hos4.text'))}</p>
          <div class="path-foot"><span class="path-route">${icon('cable')}9008 / downgrade</span><span class="spacer" style="flex:1"></span><button class="btn btn-ghost btn-sm" data-nav="unlock">${esc(t('overview.readSteps'))}</button></div>
        </div>
      </div>
    </section>

    ${demoCard ? `<section class="section">${demoCard}</section>` : ''}

    <section class="section card flat" style="border-color:#1c2027">
      <div class="row" style="align-items:flex-start">
        <span class="status-icon" data-status="pending">${icon('shield')}</span>
        <div class="grow"><div class="small" style="font-weight:600">${esc(t('overview.footer'))}</div>
        <div class="tool-meta mt-8"><span class="mono dim">DBY-W09 · GPL-3.0 upstream · local-only companion</span></div></div>
      </div>
    </section>`;
}

/* ============================ prepare ============================ */

function prepareView() {
  const snap = state.snapshot;
  const t = state.t;
  const env = snap.env;
  const dotnet = env.dotnet;
  const toolkitPresent = Boolean(env.toolkit?.present);
  const buildRunning = snap.buildRunning || state.buildBusy;
  const progress = state.buildProgress || snap.buildProgress;
  const buildLogs = (state.logCache || []).filter((entry) => entry.source === 'build').slice(-60);
  const lastBuild = snap.state.build;
  const csproj = env.toolkit?.csproj;

  const envRows = [
    [t('prepare.windows'), env.isWindows ? `${env.platformLabel} · ${env.arch}` : t('common.windowsOnly'), env.isWindows ? 'pass' : 'warn'],
    [
      t('prepare.dotnet'),
      dotnet?.has8
        ? `${dotnet.versions.filter((v) => v.startsWith('8.')).join(', ') || '8.x'} · ${dotnet.path}`
        : t('prepare.dotnetMissing'),
      dotnet?.has8 ? 'pass' : 'warn',
    ],
    [
      t('prepare.powershell'),
      env.isWindows ? (env.powershell?.found ? env.powershell.path : t('common.missing')) : t('common.notApplicable'),
      env.isWindows ? (env.powershell?.found ? 'pass' : 'warn') : 'pending',
    ],
    [
      t('prepare.adb'),
      env.isWindows ? env.adbPath || env.systemAdb || t('common.missing') : env.systemAdb || env.adbPath || t('common.missing'),
      env.adbPath || env.systemAdb ? 'pass' : 'warn',
    ],
    [t('prepare.freeSpace'), `${fmtGb(env.freeBytes)} · ${t('prepare.diskRecommend')}`, env.freeBytes != null && env.freeBytes >= 15 * 1024 ** 3 ? 'pass' : 'warn'],
    [t('prepare.toolkit'), toolkitPresent ? env.toolkit.exe || env.toolkit.path : t('prepare.notBuilt'), toolkitPresent ? 'pass' : 'pending'],
  ];

  const buildCard = `<div class="card">
    ${cardTitle('zap', t('prepare.buildTitle'), badge(t('prepare.buildRecommended'), 'is-required'))}
    <p class="small muted">${esc(t('prepare.buildText'))}</p>
    <div class="mt-12 path-text"><span class="dim">${esc(t('prepare.source'))}:</span> ${esc(snap.upstream.repo)}</div>
    <div class="row mt-8 small dim" style="gap:12px;flex-wrap:wrap">
      <span>${esc(t('prepare.commit'))}: <span class="mono">${esc(lastBuild.commit ? lastBuild.commit.slice(0, 10) : '—')}</span></span>
      <span>${esc(t('prepare.lastBuild'))}: <span class="mono">${esc(lastBuild.builtAt ? fmtDate(lastBuild.builtAt) : t('prepare.neverBuilt'))}</span></span>
    </div>
    ${
      !env.isWindows
        ? `<div class="mt-16">${notice(
            `<strong>${esc(t('prepare.windowsOnlyTitle'))}</strong> ${esc(t('prepare.windowsOnlyText'))}`,
            'warn',
            'alert',
          )}</div>`
        : ''
    }
    ${
      buildRunning
        ? `<div class="mt-16">
            <div class="row-between small"><span data-build-message>${esc(progress?.message || t('prepare.building'))}</span><span class="mono dim">${esc(progress?.phase || '')}</span></div>
            <div class="meter mt-8"><span style="width:${progress?.phase === 'publish' ? '72%' : progress?.phase === 'dotnet' ? '48%' : progress?.phase === 'done' ? '100%' : '22%'}"></span></div>
            <div class="row mt-12" style="gap:8px">
              ${button(t('prepare.cancelBuild'), 'cancel-build', { tone: 'btn-danger', size: 'btn-sm', iconName: 'stop' })}
              <span class="small dim">${esc(progress?.command || '')}</span>
            </div>
            <div class="console" data-build-log style="height:180px;border:1px solid #22262e;border-radius:8px;background:#0a0c0f;margin-top:10px">${buildLogs
              .map((entry) => logRow(entry))
              .join('')}</div>
          </div>`
        : `<div class="row mt-16" style="gap:8px;flex-wrap:wrap">
            ${button(toolkitPresent ? t('prepare.rebuildButton') : t('prepare.buildButton'), 'build', {
              tone: 'btn-primary',
              iconName: 'download',
              disabled: !env.isWindows || state.buildBusy || snap.demo,
            })}
            <label class="checkbox"><input type="checkbox" id="force-source" ${state.forceSource ? 'checked' : ''}> ${esc(t('prepare.forceSource'))}</label>
          </div>`
    }
    ${
      buildLogs.length && !buildRunning
        ? `<details class="disclosure mt-16">
            <summary>${esc(t('prepare.buildLog'))} · ${buildLogs.length}</summary>
            <div class="disclosure-body"><div class="console" style="height:220px;border:1px solid #22262e;border-radius:8px;background:#0a0c0f" data-build-log>${buildLogs
              .map((entry) => logRow(entry))
              .join('')}</div></div>
          </details>`
        : ''
    }
  </div>`;

  const existingCard = `<div class="card">
    ${cardTitle('folder', t('prepare.existingTitle'))}
    <p class="small muted">${esc(t('prepare.existingText'))}</p>
    <div class="mt-12">${button(t('prepare.selectFolder'), 'use-existing', { tone: 'btn-ghost', iconName: 'folder', disabled: snap.demo })}</div>
  </div>`;

  const readyCard = toolkitPresent
    ? `<div class="card" style="border-color:rgba(66,211,155,.28)">
        <div class="card-head"><div class="card-title" style="color:var(--good)">${icon('check')}${esc(t('prepare.toolkitReady'))}</div>${badge('EXE', 'good')}</div>
        <div class="path-text">${esc(env.toolkit.exe || env.toolkit.path)}</div>
        <div class="row mt-12" style="gap:8px;flex-wrap:wrap">
          ${button(t('prepare.launchToolkit'), 'launch-toolkit', { tone: 'btn-primary', iconName: 'play', disabled: !env.isWindows || snap.demo })}
          ${button(t('prepare.openFolder'), 'open-workspace', { tone: 'btn-ghost', iconName: 'folder', disabled: snap.demo })}
        </div>
        <div class="small dim mt-12">${esc(t('prepare.buildWrites'))}</div>
      </div>`
    : '';

  return `${pageHead({
    eyebrow: esc(t('prepare.eyebrow')),
    title: esc(t('prepare.title')),
    lede: esc(t('prepare.lede')),
    actions: button(t('common.refresh'), 'refresh', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' }),
  })}
  <div class="page-grid mt-28">
    <div class="stack-18">
      ${readyCard}
      <div class="card">
        ${cardTitle('folder', t('prepare.workspaceTitle'))}
        <div class="path-text">${esc(snap.state.workspace)}</div>
        <p class="small muted mt-8">${esc(t('prepare.workspaceText'))}</p>
        <div class="row mt-12" style="gap:8px">
          ${button(t('prepare.changeWorkspace'), 'choose-workspace', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'folder', disabled: snap.demo })}
          ${button(t('prepare.openWorkspace'), 'open-workspace', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'external', disabled: snap.demo })}
        </div>
      </div>
      ${buildCard}
      ${existingCard}
      <div class="card">
        ${cardTitle('file', t('prepare.buildWritesTitle'))}
        <p class="small muted">${esc(t('prepare.buildWrites'))}</p>
        <div class="mt-12">${notice(esc(t('prepare.gpl')), 'info', 'info')}</div>
      </div>
    </div>
    <aside class="side">
      <div class="card">
        ${cardTitle('prepare', t('prepare.envTitle'))}
        <p class="small dim">${esc(t('prepare.envText'))}</p>
        <div class="env-list mt-12">${envRows
          .map(
            ([label, value, status]) => `<div class="env-row">
              <span class="status-icon" data-status="${status}" style="width:18px;height:18px">${icon(status === 'pass' ? 'check' : 'alert')}</span>
              <span class="label">${esc(label)}</span>
              <span class="value" title="${esc(value)}">${esc(value)}</span>
            </div>`,
          )
          .join('')}</div>
        ${
          !dotnet?.has8
            ? `<div class="mt-12">${button(t('prepare.dotnetManual'), 'noop', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'external', extra: 'data-external="https://dotnet.microsoft.com/download/dotnet/8.0"' })}</div>`
            : ''
        }
      </div>
      ${
        csproj
          ? `<div class="card"><div class="card-title">${icon('file')}${esc(t('prepare.source'))}</div><div class="path-text mt-8">${esc(csproj)}</div><div class="mt-8">${button(t('prepare.revealSource'), 'reveal-source', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'folder' })}</div></div>`
          : ''
      }
    </aside>
  </div>`;
}

/* ============================ tools ============================ */

function downloadStatus(id) {
  const download = state.snapshot.downloads[id];
  const items = state.snapshot.inventory.items.filter((item) => (download?.provides || []).includes(item.id));
  const present = items.length > 0 && items.every((item) => item.present);
  return { download, present, items };
}

function toolsView() {
  const snap = state.snapshot;
  const t = state.t;
  const inv = snap.inventory;
  const groups = snap.inventoryGroups;
  const method = snap.state.method;

  const dlIds = ['platform', 'sevenzip', 'magisk', 'apatch', 'kernelpatch'];
  const downloadCards = dlIds
    .map((id) => {
      const { download, present } = downloadStatus(id);
      const progress = state.downloads[id];
      const active = progress && !['done', 'error'].includes(progress.phase);
      const pct = progress?.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
      return `<div class="download-card" data-download-card="${id}">
        <div class="name">${esc(download?.label || id)}</div>
        <div class="hint">${esc(download?.sizeHint || '')}</div>
        <div class="state" data-download-state="${id}">${
          active ? esc(progress.message || t('prepare.building')) : present ? esc(t('common.present')) : esc(t('common.missing'))
        }</div>
        <div class="meter" data-download-progress="${id}"><span style="width:${pct ?? (present ? 100 : 0)}%;${present ? 'background:var(--good)' : ''}"></span></div>
        ${button(present ? t('common.redownload') : t('common.download'), 'download', {
          tone: present ? 'btn-ghost' : 'btn',
          size: 'btn-xs',
          data: { id },
          disabled: active || snap.demo,
        })}
      </div>`;
    })
    .join('');

  const groupMarkup = groups
    .map((group) => {
      const label = state.lang === 'zh' ? GROUP_LABELS_ZH[group.id] || group.label : group.label;
      const desc = state.lang === 'zh' ? GROUP_DESC_ZH[group.id] || group.description : group.description;
      const presentCount = group.items.filter((item) => item.present).length;
      const requiredMissing = group.items.filter((item) => !item.present && item.priority === 'required').length;
      const openByDefault = !['rom', 'downgrade'].includes(group.id);
      return `<details class="disclosure" ${openByDefault ? 'open' : ''}>
        <summary>
          ${esc(label)}
          ${requiredMissing > 0 ? badge(`${requiredMissing} ${t('common.missing')}`, 'bad') : ''}
          <span class="spacer" style="flex:1"></span>
          <span class="mono dim small">${presentCount}/${group.items.length}</span>
        </summary>
        <div class="disclosure-body">
          <p class="small dim" style="margin:2px 0 8px">${esc(desc)}</p>
          <div class="tool-rows">${group.items.map((item) => toolRow(item, method)).join('')}</div>
        </div>
      </details>`;
    })
    .join('');

  const missing = inv.requiredMissing || [];
  const importResult = state.imports;

  const ramdiskItem = inv.items.find((item) => item.id === 'ramdisk');
  const ramdiskPresent = ramdiskItem?.present;

  return `${pageHead({
    eyebrow: esc(t('tools.eyebrow')),
    title: esc(t('tools.title')),
    lede: esc(t('tools.lede')),
    actions: `${button(t('tools.scan'), 'refresh', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' })}`,
  })}
  <section class="section">
    <div class="toolbar">
      <div class="btn-group" role="group" aria-label="${esc(t('tools.method'))}">
        <button class="segment ${method === 'apatch' ? 'is-active is-accent' : ''}" data-action="set-method" data-value="apatch">${esc(t('tools.apatch'))}</button>
        <button class="segment ${method === 'magisk' ? 'is-active is-accent' : ''}" data-action="set-method" data-value="magisk">${esc(t('tools.magisk'))}</button>
      </div>
      <span class="small ${missing.length ? 'status' : 'dim'}" ${missing.length ? 'data-status="fail"' : ''}>
        ${missing.length ? icon('alert') : ''} ${esc(t('tools.required', { present: inv.requiredPresent, total: inv.requiredCount }))}
      </span>
      <span class="dim small">·</span>
      <span class="dim small">${esc(t('tools.ramdiskCount', { n: inv.ramdiskCount || 0 }))}</span>
      <span class="spacer"></span>
      ${button(t('tools.openTools'), 'open-folder', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'folder', data: { kind: 'tools' }, disabled: snap.demo })}
    </div>
    ${
      missing.length
        ? `<div class="mt-12">${notice(
            `<strong>${esc(t('tools.missingTitle', { n: missing.length }))}</strong> ${esc(t('tools.missingText'))}<div class="mono small" style="margin-top:5px;color:var(--bad)">${missing
              .map((item) => esc(item.label))
              .join(' · ')}</div>`,
            'bad',
            'alert',
          )}</div>`
        : `<div class="mt-12">${notice(esc(t('tools.ready', { method: method === 'apatch' ? 'APatch' : 'Magisk' })), 'good', 'check')}</div>`
    }
  </section>

  <section class="section">
    <div class="section-head"><div><h2>${esc(t('tools.downloadsTitle'))}</h2><p>${esc(t('tools.downloadsText'))}</p></div></div>
    <div class="download-grid">${downloadCards}</div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>${esc(t('tools.importTitle'))}</h2><p>${esc(t('tools.importText'))}</p></div></div>
    <div class="dropzone" id="dropzone">
      <div class="dz-icon">${icon('package')}</div>
      <div class="dz-copy">
        <div class="dz-title">${esc(t('tools.dropTitle'))}</div>
        <div class="dz-sub">${esc(t('tools.dropSub'))}</div>
      </div>
      <div class="dz-actions">
        ${button(t('tools.chooseZip'), 'import', { size: 'btn-sm', data: { mode: 'zip' }, disabled: snap.demo })}
        ${button(t('tools.chooseFolder'), 'import', { tone: 'btn-ghost', size: 'btn-sm', data: { mode: 'folder' }, disabled: snap.demo })}
        ${button(t('tools.addRamdisk'), 'import', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'file', data: { mode: 'ramdisk' }, disabled: snap.demo })}
      </div>
    </div>
    <p class="small dim mt-8">${esc(t('tools.importNote'))}</p>
    ${
      importResult
        ? `<div class="mt-12">${notice(
            `<strong>${esc(t('tools.importedTitle'))}</strong> ${esc(
              t('tools.importedText', {
                matched: importResult.matched || 0,
                ignored: importResult.ignored || 0,
                replaced: importResult.replaced || 0,
              }),
            )}${importResult.ambiguous?.length ? `<div class="small" style="margin-top:4px;color:var(--warn)">${esc(t('tools.importAmbiguous', { names: importResult.ambiguous.map((entry) => entry.label).join(', ') }))}</div>` : ''}`,
            importResult.matched ? 'good' : 'warn',
            importResult.matched ? 'check' : 'alert',
          )}</div>`
        : ''
    }
  </section>

  <section class="section">
    <div class="section-head"><div><h2>${esc(t('tools.inventoryTitle'))}</h2><p>${esc(t('tools.inventoryText'))}</p></div><span class="mono dim small">${esc(inv.scannedAt ? fmtDate(inv.scannedAt) : '')}</span></div>
    <div class="tool-groups">${groupMarkup}</div>
    <div class="mt-16">${notice(
      `<strong>${esc(t('tools.whyManual'))}</strong> ${esc(t('tools.whyManualText'))}`,
      'info',
      'shield',
    )}</div>
    ${method === 'magisk' ? `<div class="mt-12">${notice(esc(t('tools.ramdiskNote')), 'warn', 'alert')}</div>` : ''}
  </section>`;
}

function toolRow(item, method) {
  const t = state.t;
  const present = item.present;
  const isRequired = item.priority === 'required' && (item.neededFor.includes('unlock') || item.neededFor.includes(method) || item.dynamic === 'ramdisk');
  const priorityBadge =
    item.priority === 'required'
      ? badge(t('common.required'), isRequired ? 'required' : 'optional')
      : item.priority === 'recommended'
        ? badge(t('common.recommended'), 'recommended')
        : badge(t('common.optional'), 'optional');
  const hashInfo = state.snapshot.state.hashes?.[item.rel] || null;
  const sourceLabel = item.dynamic === 'ramdisk'
    ? t('tools.sourceRuntime')
    : item.source === 'user'
      ? t('tools.sourceUser')
      : hashInfo?.source?.startsWith('import:')
        ? t('tools.sourceUser')
        : hashInfo?.source
          ? t('tools.sourceAuto')
          : t('tools.sourceExisting');
  const note = state.lang === 'zh' ? ITEM_NOTES_ZH[item.id] || item.note : item.note;
  const label = item.dynamic === 'ramdisk' ? (state.lang === 'zh' ? 'ramdisk 镜像' : 'ramdisk image') : item.label;
  const action =
    item.dynamic === 'ramdisk'
      ? button(present ? t('common.open') : t('tools.addRamdisk'), present ? 'open-folder' : 'import', {
          tone: present ? 'btn-ghost' : 'btn',
          size: 'btn-xs',
          data: present ? { kind: 'ramdisk' } : { mode: 'ramdisk' },
          disabled: state.snapshot.demo,
        })
      : item.source === 'user'
        ? button(present ? t('common.reveal') : t('common.import'), present ? 'reveal-item' : 'import', {
            tone: present ? 'btn-ghost' : 'btn',
            size: 'btn-xs',
            data: present ? { path: item.absolute } : { mode: 'zip' },
            disabled: state.snapshot.demo,
          })
        : button(present ? t('common.redownload') : t('common.download'), 'download', {
            tone: 'btn-ghost',
            size: 'btn-xs',
            data: { id: item.source === 'google' ? 'platform' : item.source === '7zip' ? 'sevenzip' : item.source },
            disabled: state.snapshot.demo,
          });
  const hashButton = present
    ? `<button class="btn btn-quiet btn-xs" data-action="hash-item" data-id="${esc(item.id)}" title="${esc(t('common.hash'))}" ${state.snapshot.demo ? 'disabled' : ''}>${icon('hash')}</button>`
    : '';
  return `<div class="tool-row ${present ? '' : 'is-missing'}">
    ${statusIcon(present ? 'ready' : 'blocked')}
    <div class="tool-row-main">
      <div class="tool-name"><span class="file">${esc(label)}</span>${priorityBadge}${badge(sourceLabel, 'source')}</div>
      <div class="tool-path" title="${esc(item.absolute || item.rel)}">${esc(item.rel)}</div>
      <div class="tool-note">${esc(note)}</div>
      ${item.hash ? `<div class="tool-hash">sha256 ${esc(item.hash.slice(0, 18))}…</div>` : ''}
    </div>
    <div class="tool-meta"><span class="tool-size">${present ? fmtBytes(item.bytes) : '—'}</span></div>
    <div class="tool-actions">${hashButton}${action}</div>
  </div>`;
}

/* ============================ device ============================ */

function gateLabel(id) {
  const t = state.t;
  const map = {
    windows: t('steps.pc'),
    toolkit: t('prepare.toolkit'),
    toolpack: t('steps.toolpack'),
    model: t('device.model'),
    os: t('device.harmony'),
    battery: t('device.battery'),
    disk: t('prepare.freeSpace'),
    backup: t('unlock.ackTitle'),
    device: t('device.passport'),
    unlocked: t('device.bootloader'),
  };
  return map[id] || id;
}

function localGateDetail(gate) {
  const snap = state.snapshot;
  const t = state.t;
  switch (gate.id) {
    case 'windows':
      return snap.env.isWindows ? `${snap.env.platformLabel} · ${snap.env.arch}` : t('prepare.windowsOnlyText');
    case 'toolkit':
      return snap.env.toolkit?.present ? snap.env.toolkit.exe || snap.env.toolkit.path : t('prepare.notBuilt');
    case 'toolpack':
      return `${snap.inventory.requiredPresent}/${snap.inventory.requiredCount} ${t('common.required').toLowerCase()}${
        snap.inventory.requiredMissing?.length ? ` · ${snap.inventory.requiredMissing.map((item) => item.label).join(', ')}` : ''
      }`;
    case 'device':
      return snap.device?.state === 'device' ? t('topbar.connected') : snap.device?.state || t('overview.noDevice');
    case 'model':
      return snap.device?.model || '—';
    case 'os':
      return snap.device?.os?.version ? `HarmonyOS ${snap.device.os.version} · Android ${snap.device.os.android || '?'}` : t('common.unknown');
    case 'battery':
      return snap.device?.battery?.level != null ? `${snap.device.battery.level}%` : t('common.unknown');
    case 'disk':
      return fmtGb(snap.env.freeBytes);
    case 'backup':
      return snap.state.acknowledgements.unlockWipe ? fmtDate(snap.state.acknowledgements.unlockWipe) : t('unlock.ackText');
    case 'unlocked':
      return snap.readiness.unlocked ? t('device.unlocked') : t('unlock.notVerified');
    default:
      return gate.detail;
  }
}

function gateRows(gates) {
  return `<div class="check-list">${gates
    .map(
      (gate) => `<div class="check-row">
        ${statusIcon(gate.status)}
        <div class="check-copy"><div class="check-label">${esc(gateLabel(gate.id))}</div><div class="check-detail">${esc(localGateDetail(gate))}</div></div>
        ${statusText(gate.status)}
      </div>`,
    )
    .join('')}</div>`;
}

function deviceView() {
  const snap = state.snapshot;
  const t = state.t;
  const device = snap.device;
  const connected = device?.state === 'device';
  const unauthorized = device?.state === 'unauthorized';

  const edl = snap.edl || { ports: [], supported: snap.env.isWindows };
  const edlCard = `<div class="card">
    ${cardTitle('cable', t('device.edlTitle'), `<span class="mono dim small">COM / QUSB</span>`)}
    <p class="small muted">${esc(t('device.edlText'))}</p>
    <div class="mt-12">${button(t('device.edlDetect'), 'detect-edl', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'search' })}</div>
    <div class="mt-12">
      ${
        edl.ports?.length
          ? `<div class="stack">${edl.ports
              .map(
                (port) => `<div class="row small" style="gap:8px"><span class="dot accent"></span><span class="mono">${esc(port.name)}</span>${
                  port.comPort ? `<span class="dim">COM${esc(port.comPort)}</span>` : ''
                }</div>`,
              )
              .join('')}</div>`
          : `<div class="small dim">${esc(t('device.edlNone'))}</div>`
      }
      ${edl.error ? `<div class="small" style="color:var(--bad);margin-top:4px">${esc(edl.error)}</div>` : ''}
      ${!edl.supported ? `<div class="small dim" style="margin-top:6px">${esc(edl.note || '')}</div>` : ''}
    </div>
    <div class="mt-12">${notice(esc(t('device.edlNote')), 'info', 'info')}</div>
  </div>`;

  if (!connected) {
    return `${pageHead({
      eyebrow: esc(t('device.eyebrow')),
      title: esc(t('device.title')),
      lede: esc(t('device.lede')),
      actions: button(t('common.refresh'), 'refresh-device', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' }),
    })}
    <div class="page-grid mt-28">
      <div class="stack-18">
        <div class="card">
          ${cardTitle('usb', unauthorized ? t('device.unauthorized') : t('device.noTitle'), badge(unauthorized ? 'UNAUTHORIZED' : 'NO DEVICE', unauthorized ? 'warn' : '') )}
          <p class="small muted">${esc(unauthorized ? t('device.unauthorizedText') : t('device.noText'))}</p>
          <div class="check-list mt-12">
            ${[t('device.step1'), t('device.step2'), t('device.step3')]
              .map(
                (text, index) => `<div class="check-row"><span class="step-num">${index + 1}</span><div class="check-copy"><div class="check-detail" style="font-size:12px;color:var(--text-2)">${esc(text)}</div></div></div>`,
              )
              .join('')}
          </div>
          <div class="row mt-16" style="gap:8px">
            ${button(t('device.detect'), 'refresh-device', { tone: 'btn-primary', iconName: 'usb', disabled: snap.demo })}
            ${button(t('device.restartAdb'), 'restart-adb', { tone: 'btn-ghost', iconName: 'refresh', disabled: snap.demo })}
          </div>
          <div class="mt-16">${notice(esc(t('device.closeHisuite')), 'warn', 'alert')}</div>
        </div>
        ${edlCard}
        <div class="card">
          ${cardTitle('help', t('device.usbHelp'))}
          <p class="small muted">${esc(t('device.usbHelpText'))}</p>
        </div>
      </div>
      <aside class="side">
        <div class="card">${cardTitle('shield', t('device.gatesTitle'))}${gateRows(snap.gates.gates.slice(0, 6))}</div>
      </aside>
    </div>`;
  }

  const battery = device.battery?.level;
  const bootState = device.bootloader?.unlocked;
  const rootState = device.rootVerified;
  const usedStorage = device.storage?.totalBytes - device.storage?.freeBytes;
  const storagePct = device.storage?.totalBytes ? Math.round((usedStorage / device.storage.totalBytes) * 100) : null;
  const fastboot = snap.fastboot;
  const fastbootLine =
    fastboot?.state === 'fastboot'
      ? fastboot.unlocked === true
        ? t('device.fastbootUnlocked')
        : fastboot.unlocked === false
          ? t('device.fastbootLocked')
          : t('device.fastbootUnknown')
      : null;
  const installAction = snap.state.method === 'magisk' ? 'install-magisk' : 'install-apatch';
  const apkPresent = snap.inventory.items.find((item) => item.id === (snap.state.method === 'magisk' ? 'magisk_apk' : 'apatch_apk'))?.present;

  return `${pageHead({
    eyebrow: esc(t('device.eyebrow')),
    title: esc(t('device.title')),
    lede: esc(t('device.lede')),
    actions: button(t('common.refresh'), 'refresh-device', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' }),
  })}
  <div class="page-grid mt-28">
    <div class="stack-18">
      <div class="card">
        <div class="device-hero">
          <div class="device-identity">
            <div class="device-glyph">${icon('device')}</div>
            <div>
              <div class="eyebrow" style="margin:0 0 4px">${esc(t('device.passport'))}</div>
              <h2>${esc(device.model || 'DBY-W09')}</h2>
              <div class="sub">HarmonyOS ${esc(device.os?.version || '?')} · Android ${esc(device.os?.android || '?')} · API ${esc(
                device.os?.api || device.os?.sdk || '?',
              )}</div>
            </div>
          </div>
          <div class="device-chips">
            ${badge(t('topbar.connected'), 'good')}
            ${badge(
              bootState === true ? t('device.unlocked') : bootState === false ? t('device.locked') : t('device.notChecked'),
              bootState === true ? 'good' : bootState === false ? 'warn' : '',
            )}
            ${badge(rootState ? t('device.rootVerifiedBadge') : t('device.rootUnknown'), rootState ? 'good' : '')}
          </div>
        </div>
        <div class="device-bars">
          <div>
            <div class="bar-label"><span>${esc(t('device.battery'))}</span><strong>${battery != null ? `${battery}%` : '—'} ${
              device.battery?.charging ? `· ${esc(t('device.charging'))}` : ''
            }</strong></div>
            <div class="meter ${battery != null && battery < 40 ? 'warn' : 'good'}"><span style="width:${Math.min(100, battery || 0)}%"></span></div>
          </div>
          <div>
            <div class="bar-label"><span>${esc(t('device.storage'))}</span><strong>${fmtGb(device.storage?.freeBytes)} ${esc(t('common.freeSpace'))}</strong></div>
            <div class="meter"><span style="width:${storagePct ?? 0}%;background:var(--info)"></span></div>
          </div>
        </div>
        <div class="divider"></div>
        <dl class="kv">
          <dt>${esc(t('device.build'))}</dt><dd title="${esc(device.build)}">${esc(device.build || '—')}</dd>
          <dt>${esc(t('device.serial'))}</dt><dd class="mono">${esc(device.serialMasked || '—')}</dd>
          <dt>${esc(t('device.detected'))}</dt><dd>${esc(fmtDate(device.detectedAt))}</dd>
          <dt>${esc(t('device.securityPatch'))}</dt><dd>${esc(device.securityPatch || '—')}</dd>
        </dl>
        ${device.multiple ? `<div class="mt-12">${notice(esc(t('device.multiple')), 'warn', 'alert')}</div>` : ''}
      </div>

      <div class="card">
        ${cardTitle('settings', t('device.actions'))}
        <div class="actions-row">
          ${button(t('device.checkBootloader'), 'check-fastboot', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'lock', disabled: snap.demo })}
          ${button(t('device.verifyRoot'), 'verify-root', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'shield', disabled: snap.demo })}
          ${button(snap.state.method === 'magisk' ? t('device.installMagisk') : t('device.installApatch'), 'install-apk', {
            tone: 'btn-ghost',
            size: 'btn-sm',
            iconName: 'package',
            data: { kind: snap.state.method },
            disabled: !apkPresent || snap.demo,
            title: apkPresent ? '' : t('root.noApk'),
          })}
          ${button(t('device.rebootBootloader'), 'reboot', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh', data: { mode: 'bootloader' }, disabled: snap.demo })}
          ${button(t('device.rebootSystem'), 'reboot', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh', data: { mode: 'system' }, disabled: snap.demo })}
          ${button(t('device.restartAdb'), 'restart-adb', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'usb', disabled: snap.demo })}
        </div>
        ${
          fastboot
            ? `<div class="mt-16 notice ${fastbootLine?.includes('yes') ? 'good' : 'info'}" style="border-radius:8px">
                ${icon(fastbootLine?.includes('yes') ? 'check' : 'info')}
                <div><strong>${esc(t('device.fastbootTitle'))}</strong><div class="mono small mt-8">${esc(fastbootLine || fastboot.message || '')}</div>
                ${fastboot.state === 'none' ? `<div class="small dim mt-8">${esc(t('device.fastbootNone'))}</div>` : ''}</div>
              </div>`
            : ''
        }
        <div class="small dim mt-8">${esc(t('device.fastbootHint'))}</div>
      </div>

      ${edlCard}

      <div class="card">
        <details class="disclosure">
          <summary>${esc(t('device.propsTitle'))}</summary>
          <div class="disclosure-body">
            <p class="small dim">${esc(t('device.propsText'))}</p>
            <table class="prop-table"><tbody>${Object.entries(device.props || {})
              .map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`)
              .join('')}</tbody></table>
          </div>
        </details>
      </div>
    </div>
    <aside class="side">
      <div class="card">
        ${cardTitle('shield', t('device.gatesTitle'))}
        ${gateRows((snap.gates.gates || []).filter((gate) => ['model', 'os', 'battery', 'disk', 'backup', 'toolpack'].includes(gate.id)))}
      </div>
      <div class="card">
        <details class="disclosure">
          <summary>${esc(t('device.usbHelp'))}</summary>
          <div class="disclosure-body"><p class="small muted">${esc(t('device.usbHelpText'))}</p></div>
        </details>
        <div class="small dim mt-12">${esc(t('device.closeHisuite'))}</div>
      </div>
    </aside>
  </div>`;
}

/* ============================ unlock ============================ */

function stepKey(flow, id, method) {
  return flow === 'root' && method ? `${method}:${id}` : id;
}

function isStepDone(flow, id, method) {
  const steps = state.snapshot.state.progress?.[flow]?.steps || {};
  return Boolean(steps[stepKey(flow, id, method)]);
}

function renderSteps(flow, steps, method) {
  const t = state.t;
  return `<div class="steps">${steps
    .map((step, index) => {
      const done = isStepDone(flow, step.id, method);
      const isLast = index === steps.length - 1;
      return `<div class="step ${done ? 'is-done' : ''}" data-step-wrap="${esc(step.id)}">
        <span class="step-num">${done ? icon('check') : String(index + 1).padStart(2, '0')}</span>
        <div class="step-body">
          <div class="step-head">
            <div class="step-title">${esc(step.title)}</div>
            <label class="checkbox step-check"><input type="checkbox" aria-label="${esc(step.title)}" data-step-flow="${esc(flow)}" data-step-id="${esc(step.id)}" ${
              done ? 'checked' : ''
            } data-step-complete="${isLast ? 'true' : 'false'}" data-step-method="${esc(method || '')}"> ${esc(t('unlock.doneBadge'))}</label>
          </div>
          <div class="step-text">${inline(step.body)}</div>
          ${step.expect ? `<div class="step-expect"><strong>${esc(t('unlock.expected'))}</strong><span>${inline(step.expect)}</span></div>` : ''}
          ${step.stuck ? `<details class="step-stuck"><summary>${esc(t('unlock.stuck'))}</summary><p>${inline(step.stuck)}</p></details>` : ''}
        </div>
      </div>`;
    })
    .join('')}</div>`;
}

function unlockView() {
  const snap = state.snapshot;
  const t = state.t;
  const route = snap.route;
  const locRoute = localRoute();
  const ack = snap.state.acknowledgements.unlockWipe;
  const unlocked = snap.readiness.unlocked;
  const canUnlock = snap.readiness.canUnlock;
  const device = snap.device;
  const branch = route?.route === 'engineering' ? 'engineering' : route?.route === 'adb-edl' ? 'adb' : null;
  const steps = branch ? PROCEDURE[state.lang === 'zh' ? 'zh' : 'en'].unlock[branch] : [];
  const never = [t('unlock.never1'), t('unlock.never2'), t('unlock.never3'), t('unlock.never4')];
  const fastboot = snap.fastboot;

  const ackBlock = ack
    ? `<div class="notice good">${icon('check')}<div><strong>${esc(t('unlock.acked', { when: fmtDate(ack) }))}</strong></div></div>`
    : `<div class="ack-box">
        <h3>${esc(t('unlock.ackTitle'))}</h3>
        <p>${esc(t('unlock.ackText'))}</p>
        <form id="wipe-form" class="ack-form">
          <input class="input" id="wipe-phrase" name="phrase" placeholder="${esc(t('unlock.ackPlaceholder'))}" autocomplete="off" spellcheck="false" value="${esc(state.wipePhrase)}">
          <label class="checkbox"><input type="checkbox" id="wipe-backup" ${state.wipeBackup ? 'checked' : ''}> ${esc(t('unlock.ackBackup'))}</label>
          <button class="btn btn-danger" type="submit" ${state.wipePhrase.trim().toUpperCase() === 'WIPE' && state.wipeBackup ? '' : 'disabled'}>${esc(t('unlock.ackButton'))}</button>
        </form>
        <div class="ack-note mt-8">${esc(t('unlock.wipePhrase'))}</div>
      </div>`;

  const routePanel = `<div class="card" style="border-color:${route?.route === 'engineering' ? 'rgba(255,194,75,.25)' : 'var(--line)'}">
    ${cardTitle(
      'unlock',
      t('unlock.routeTitle'),
      badge(
        route?.route === 'already-unlocked'
          ? t('unlock.branchDone')
          : branch === 'engineering'
            ? t('unlock.branchEngineering')
            : branch === 'adb'
              ? t('unlock.branchAdb')
              : t('common.unknown'),
        route?.route === 'already-unlocked' ? 'good' : branch === 'engineering' ? 'warn' : '',
      ),
    )}
    <div class="row" style="align-items:flex-start;gap:10px">
      ${statusIcon(branch === 'engineering' ? 'attention' : route?.route === 'unknown' ? 'unknown' : 'ready')}
      <div>
        <div style="font-size:14px;font-weight:600">${esc(locRoute.title)}</div>
        <p class="small muted mt-8">${esc(locRoute.detail)}</p>
        ${
          device?.state === 'device'
            ? `<div class="row mt-12" style="gap:8px;flex-wrap:wrap">${badge(device.model || 'DBY-W09', 'good')}${badge(
                `HarmonyOS ${device.os?.version || '?'}`,
                '',
              )}${
                device.bootloader?.unlocked === true ? badge(t('device.unlocked'), 'good') : badge(t('device.locked'), '')
              }</div>`
            : `<div class="row mt-12" style="gap:8px;flex-wrap:wrap">${badge(t('topbar.noDevice'), '')}</div>`
        }
        ${
          branch === 'engineering'
            ? `<div class="mt-12"><button class="btn btn-ghost btn-sm" data-external="${esc(snap.urls.deviceGuide)}">${icon('external')}${esc(
                state.lang === 'zh' ? '打开 HOS 4.2 操作记录' : 'Open the HOS 4.2 procedure write-up',
              )}</button></div>`
            : ''
        }
      </div>
    </div>
  </div>`;

  const preflight = `<div class="card">
    ${cardTitle('shield', t('unlock.preflight'), statusText(canUnlock ? 'ready' : unlocked ? 'ready' : 'attention'))}
    <p class="small muted">${esc(t('unlock.preflightText'))}</p>
    <div class="mt-12">${gateRows(snap.gates.gates)}</div>
    ${!canUnlock && !unlocked ? `<div class="mt-12">${notice(esc(t('unlock.gatesBlocked')), 'warn', 'alert')}</div>` : ''}
    ${canUnlock || unlocked ? `<div class="mt-12">${notice(esc(t('unlock.ready')), 'good', 'check')}</div>` : ''}
  </div>`;

  const actionPanel = `<div class="card">
    ${cardTitle('terminal', t('unlock.openToolkit'))}
    <p class="small muted">${esc(t('unlock.openToolkitNote'))}</p>
    <div class="row mt-12" style="gap:8px;flex-wrap:wrap">
      ${button(t('unlock.openToolkit'), 'launch-toolkit', {
        tone: 'btn-primary',
        iconName: 'play',
        disabled: snap.demo || (!unlocked && !canUnlock),
      })}
      ${button(t('unlock.verifyButton'), 'check-fastboot', { tone: 'btn-ghost', iconName: 'lock', disabled: snap.demo })}
    </div>
    ${
      unlocked
        ? `<div class="mt-12">${notice(esc(t('unlock.verifiedUnlocked')), 'good', 'check')}</div>`
        : `<div class="mt-12">${notice(esc(t('unlock.notVerified')), 'info', 'info')}</div>`
    }
    ${
      fastboot?.state === 'fastboot'
        ? `<div class="path-text mt-12">fastboot getvar unlocked → ${esc(
            fastboot.unlocked === true ? 'yes' : fastboot.unlocked === false ? 'no' : 'unknown',
          )}</div>`
        : `<div class="small dim mt-12">${esc(t('unlock.fastbootNote'))}</div>`
    }
  </div>`;

  return `${pageHead({
    eyebrow: esc(t('unlock.eyebrow')),
    title: esc(t('unlock.title')),
    lede: esc(t('unlock.lede')),
    actions: button(t('common.refresh'), 'refresh', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' }),
  })}
  <div class="risk-banner mt-20">
    <div class="risk-icon">${icon('alert')}</div>
    <div><h3>${esc(t('modal.disclaimer.title'))}</h3><p>${esc(t('modal.disclaimer.item2'))}</p></div>
    ${button(t('unlock.neverTitle'), 'safety-checklist', { tone: 'btn-danger', size: 'btn-sm', iconName: 'shield' })}
  </div>
  <div class="page-grid mt-20">
    <div class="stack-18">
      ${routePanel}
      ${!device ? `<div>${notice(esc(t('unlock.noDevice')), 'warn', 'alert')}</div>` : ''}
      ${ackBlock}
      ${preflight}
      ${
        steps.length
          ? `<div class="card">${cardTitle('layers', t('unlock.stepsTitle'), branch ? badge(t(`unlock.branch${branch === 'adb' ? 'Adb' : 'Engineering'}`), '') : '')}${renderSteps('unlock', steps)}</div>`
          : unlocked
            ? `<div class="card">${notice(esc(t('unlock.routeAlreadyDetail')), 'good', 'check')}<div class="mt-12"><button class="btn btn-primary" data-nav="root">${icon('root')}${esc(t('nav.root'))}</button></div></div>`
            : `<div class="card">${emptyState('usb', t('unlock.routeNone'), t('unlock.noDevice'), button(t('common.refresh'), 'refresh-device', { tone: 'btn-primary', size: 'btn-sm', iconName: 'usb' }))}</div>`
      }
      <div class="card">
        ${cardTitle('alert', t('unlock.neverTitle'))}
        <div class="never-list">${never.map((text) => `<div class="never-item">${icon('x')}<span>${esc(text)}</span></div>`).join('')}</div>
      </div>
    </div>
    <aside class="side">
      ${actionPanel}
      <div class="card">${cardTitle('info', t('unlock.verifyTitle'))}<p class="small muted">${esc(t('unlock.verifyText'))}</p><div class="mt-12">${button(t('unlock.verifyButton'), 'check-fastboot', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'lock' })}</div></div>
    </aside>
  </div>`;
}

/* ============================ root ============================ */

function rootView() {
  const snap = state.snapshot;
  const t = state.t;
  const method = snap.state.method;
  const steps = PROCEDURE[state.lang === 'zh' ? 'zh' : 'en'].root[method];
  const unlocked = snap.readiness.unlocked;
  const canRoot = snap.readiness.canRoot;
  const inv = snap.inventory;
  const itemById = (id) => inv.items.find((item) => item.id === id);
  const apkItem = itemById(method === 'magisk' ? 'magisk_apk' : 'apatch_apk');
  const ramdisk = itemById('ramdisk');
  const requiredPieces = method === 'magisk' ? [itemById('magisk_apk'), itemById('ramdisk')] : [itemById('kptools'), itemById('kpimg'), itemById('apatch_apk')];
  const missing = requiredPieces.filter((item) => item && !item.present).map((item) => item.label);
  const verified = snap.readiness.rooted;
  const fastboot = snap.fastboot;

  const methodCard = (id, title, badgeText, text) => `<div class="option-card ${method === id ? 'is-selected' : ''}" role="button" tabindex="0" data-action="set-method" data-value="${id}" style="text-align:left;cursor:pointer;border:1px solid ${method === id ? 'var(--accent-line)' : 'var(--line)'}">
    <h3>${esc(title)} ${badge(badgeText, method === id ? 'required' : '')}${method === id ? badge(t('root.selected'), 'good') : ''}</h3>
    <p>${esc(text)}</p>
    <div class="row mt-8" style="gap:8px">${badge(
      id === 'apatch' ? 'kptools + kpimg' : 'patched ramdisk',
      'source',
    )}${badge(id === 'apatch' ? '9008 required' : 'manual patch', 'source')}</div>
  </div>`;

  const prereqRows = [
    {
      status: unlocked ? 'pass' : 'fail',
      label: t('device.bootloader'),
      detail: unlocked ? t('unlock.verifiedUnlocked') : t('unlock.notVerified'),
    },
    {
      status: missing.length === 0 ? 'pass' : 'fail',
      label: t('steps.toolpack'),
      detail: missing.length === 0 ? t('tools.ready', { method: method === 'apatch' ? 'APatch' : 'Magisk' }) : missing.join(', '),
    },
    {
      status: snap.env.toolkit?.present ? 'pass' : 'fail',
      label: t('prepare.toolkit'),
      detail: snap.env.toolkit?.present ? snap.env.toolkit.exe : t('prepare.notBuilt'),
    },
    {
      status: snap.device?.battery?.level == null ? 'unknown' : snap.device.battery.level >= 40 ? 'pass' : 'fail',
      label: t('device.battery'),
      detail: snap.device?.battery?.level != null ? `${snap.device.battery.level}%` : t('common.unknown'),
    },
  ];

  const installButton = button(t('root.installApk'), 'install-apk', {
    tone: 'btn-ghost',
    size: 'btn-sm',
    iconName: 'package',
    data: { kind: method },
    disabled: !apkItem?.present,
    title: apkItem?.present ? '' : t('root.noApk'),
  });

  return `${pageHead({
    eyebrow: esc(t('root.eyebrow')),
    title: esc(t('root.title')),
    lede: esc(t('root.lede')),
    actions: button(t('common.refresh'), 'refresh', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'refresh' }),
  })}
  ${
    !canRoot
      ? `<div class="mt-20">${notice(
          `<strong>${esc(t('root.gatesBlocked'))}</strong> ${
            !unlocked ? esc(t('unlock.notVerified')) : missing.length ? esc(missing.join(', ')) : ''
          }`,
          'warn',
          'alert',
        )}</div>`
      : `<div class="mt-20">${notice(esc(t('unlock.ready')), 'good', 'check')}</div>`
  }
  <div class="page-grid mt-20">
    <div class="stack-18">
      <div class="card">
        ${cardTitle('root', t('root.methodTitle'))}
        <div class="two-col" style="gap:10px">
          ${methodCard('apatch', t('root.apatchTitle'), t('root.apatchBadge'), t('root.apatchText'))}
          ${methodCard('magisk', t('root.magiskTitle'), t('root.magiskBadge'), t('root.magiskText'))}
        </div>
        <div class="mt-12">${method === 'apatch' ? notice(esc(t('root.apatchWarning')), 'info', 'info') : notice(esc(t('root.magiskWarning')), 'warn', 'alert')}</div>
      </div>

      <div class="card">
        ${cardTitle('shield', t('root.prereqTitle'), statusText(missing.length || !unlocked ? 'attention' : 'ready'))}
        <div class="check-list">${prereqRows
          .map(
            (row) => `<div class="check-row">${statusIcon(row.status)}<div class="check-copy"><div class="check-label">${esc(row.label)}</div><div class="check-detail">${esc(row.detail)}</div></div>${statusText(row.status)}</div>`,
          )
          .join('')}</div>
        <div class="row mt-12" style="gap:8px;flex-wrap:wrap">
          ${installButton}
          ${method === 'magisk' ? button(t('root.openRamdisk'), 'open-folder', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'folder', data: { kind: 'ramdisk' }, disabled: snap.demo }) : ''}
          ${button(t('root.openToolkit'), 'launch-toolkit', { tone: 'btn-primary', size: 'btn-sm', iconName: 'play', disabled: !canRoot || snap.demo })}
        </div>
      </div>

      <div class="card">${cardTitle('layers', t('root.stepsTitle'), badge(method === 'apatch' ? 'APatch' : 'Magisk', ''))}${renderSteps('root', steps, method)}</div>

      <div class="card">
        ${cardTitle('info', t('root.aftercareTitle'))}
        <div class="never-list">
          ${[t('root.aftercare1'), t('root.aftercare2'), t('root.aftercare3')].map((text) => `<div class="never-item">${icon('info')}<span>${esc(text)}</span></div>`).join('')}
        </div>
      </div>
    </div>
    <aside class="side">
      <div class="card">
        ${cardTitle('shield', t('root.verifyTitle'), statusText(verified ? 'ready' : 'pending'))}
        <p class="small muted">${esc(t('root.verifyText'))}</p>
        <div class="mt-12">${button(t('root.verifyButton'), 'verify-root', { tone: verified ? 'btn-ghost' : 'btn-primary', iconName: 'shield', disabled: snap.demo || !snap.device || snap.device.state !== 'device' })}</div>
        <div class="mt-12">${verified ? notice(esc(t('root.verified')), 'good', 'check') : notice(esc(t('root.notVerified')), 'info', 'info')}</div>
        ${fastboot?.state === 'fastboot' ? `<div class="path-text mt-12">fastboot: ${esc(fastboot.unlocked === true ? 'unlocked' : 'locked')}</div>` : ''}
      </div>
      <div class="card">
        ${cardTitle('terminal', t('root.stepsTitle'))}
        <p class="small dim">${esc(t('root.toolkitNote'))}</p>
        <div class="path-text mt-8">${method === 'apatch' ? 'Root → APatch → one-click' : 'Root → Magisk → select ramdisk'}</div>
      </div>
    </aside>
  </div>`;
}

/* ============================ console ============================ */

function logMatches(entry) {
  if (state.consoleFilter === 'app') {
    if (['adb', 'fastboot', 'build', 'download', 'import'].includes(entry.source)) return false;
  } else if (state.consoleFilter !== 'all' && entry.source !== state.consoleFilter) {
    return false;
  }
  if (state.consoleQuery) {
    const needle = state.consoleQuery.toLowerCase();
    if (!`${entry.source} ${entry.message} ${entry.level}`.toLowerCase().includes(needle)) return false;
  }
  return true;
}

function logRow(entry) {
  const level = ['good', 'warn', 'error', 'debug'].includes(entry.level) ? entry.level : 'info';
  return `<div class="log-row ${entry.level}" data-log-id="${esc(entry.id)}">
    <span class="log-time">${esc(fmtTime(entry.ts))}</span>
    <span class="log-level ${level}">${esc(entry.level)}</span>
    <span class="log-source" title="${esc(entry.source)}">${esc(entry.source)}</span>
    <span class="log-msg">${esc(entry.message)}</span>
  </div>`;
}

function consoleRows() {
  const logs = (state.logCache || []).filter(logMatches);
  if (!logs.length) return `<div class="console-empty">${esc(state.t('console.empty'))}</div>`;
  return logs.map(logRow).join('');
}

function consoleView() {
  const t = state.t;
  const filters = ['all', 'app', 'adb', 'fastboot', 'build', 'download'];
  const logs = (state.logCache || []).filter(logMatches);
  return `${pageHead({
    eyebrow: esc(t('console.eyebrow')),
    title: esc(t('console.title')),
    lede: esc(t('console.lede')),
    actions: `${button(t('console.export'), 'export-diagnostics', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'save' })}${button(t('common.clear'), 'clear-logs', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'trash', disabled: state.snapshot.demo })}`,
  })}
  <div class="console-wrap mt-28">
    <div class="console-bar">
      <div class="console-filters">${filters
        .map(
          (filter) =>
            `<button class="filter-btn ${state.consoleFilter === filter ? 'is-active' : ''}" data-action="console-filter" data-value="${filter}">${esc(
              t(`console.filter.${filter}`),
            )}</button>`,
        )
        .join('')}</div>
      <div class="console-search"><input id="console-search" placeholder="${esc(t('console.search'))}" value="${esc(state.consoleQuery)}" aria-label="${esc(t('console.search'))}"></div>
      <button class="filter-btn ${state.autoscroll ? 'is-active' : ''}" data-action="toggle-autoscroll">${esc(t('console.autoscroll'))}</button>
      <span class="dim small">${esc(t('console.count', { n: logs.length }))}</span>
    </div>
    <div class="console" id="console-body">${consoleRows()}</div>
    <div class="console-foot">${icon('lock')}<span>${esc(t('console.local'))}</span><span class="spacer"></span><span class="mono">${esc(state.snapshot.state.workspace)}</span></div>
  </div>
  <div class="row mt-12" style="gap:8px">
    ${button(t('common.copy'), 'copy-logs', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'copy' })}
    ${button(t('console.export'), 'export-diagnostics', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'save' })}
  </div>`;
}

/* ============================ settings ============================ */

function settingsView() {
  const snap = state.snapshot;
  const t = state.t;
  const ack = snap.state.acknowledgements;
  const unlockSteps = Object.values(snap.state.progress.unlock.steps || {}).filter(Boolean).length;
  const rootSteps = Object.values(snap.state.progress.root.steps || {}).filter(Boolean).length;
  return `${pageHead({
    eyebrow: esc(t('settings.eyebrow')),
    title: esc(t('settings.title')),
    lede: esc(t('settings.lede')),
  })}
  <div class="settings-grid mt-28">
    <div class="stack-18">
      <div class="card">
        ${cardTitle('settings', t('settings.language'))}
        <div class="setting-row">
          <div><div class="label">${esc(t('settings.language'))}</div><div class="sub">${esc(t('settings.languageText'))}</div></div>
          <div class="control btn-group">
            <button class="segment ${snap.state.language === 'en' ? 'is-active' : ''}" data-action="set-language" data-value="en">English</button>
            <button class="segment ${snap.state.language === 'zh' ? 'is-active' : ''}" data-action="set-language" data-value="zh">简体中文</button>
          </div>
        </div>
        <div class="setting-row">
          <div><div class="label">${esc(t('settings.workspace'))}</div><div class="sub">${esc(t('settings.workspaceText'))}</div></div>
          <div class="control">${button(t('settings.change'), 'choose-workspace', { tone: 'btn-ghost', size: 'btn-sm', disabled: snap.demo })}</div>
        </div>
        <div class="path-text">${esc(snap.state.workspace)}</div>
        <div class="setting-row">
          <div><div class="label">${esc(t('settings.demo'))}</div><div class="sub">${esc(t('settings.demoText'))}</div></div>
          <div class="control"><button class="switch ${snap.demo ? 'is-on' : ''}" data-action="set-demo" data-value="${snap.demo ? 'false' : 'true'}" role="switch" aria-checked="${snap.demo ? 'true' : 'false'}" aria-label="${esc(t('settings.demo'))}"></button></div>
        </div>
        ${snap.demo ? `<div class="small" style="color:var(--warn)">${esc(t('settings.demoOn'))}</div>` : ''}
      </div>

      <div class="card">
        ${cardTitle('layers', t('settings.progress'))}
        <p class="small muted">${esc(t('settings.progressText'))}</p>
        <div class="env-list mt-12">
          <div class="env-row"><span class="label">${esc(t('settings.unlockSteps'))}</span><span class="value">${unlockSteps} ${esc(t('common.ready').toLowerCase())}</span></div>
          <div class="env-row"><span class="label">${esc(t('settings.rootSteps'))}</span><span class="value">${rootSteps} ${esc(t('common.ready').toLowerCase())}</span></div>
          <div class="env-row"><span class="label">${esc(t('unlock.ackTitle'))}</span><span class="value">${ack.unlockWipe ? esc(fmtDate(ack.unlockWipe)) : esc(t('common.none'))}</span></div>
          <div class="env-row"><span class="label">${esc(t('modal.disclaimer.eyebrow'))}</span><span class="value">${ack.disclaimer ? esc(fmtDate(ack.disclaimer)) : esc(t('common.none'))}</span></div>
        </div>
        <div class="mt-12">${button(t('settings.reset'), 'reset-progress', { tone: 'btn-danger', size: 'btn-sm', iconName: 'trash', disabled: snap.demo })}</div>
      </div>

      <div class="card">
        ${cardTitle('info', t('settings.about'))}
        <div class="env-list">
          <div class="env-row"><span class="label">${esc(t('settings.version'))}</span><span class="value mono">${esc(snap.app.version)}</span></div>
          <div class="env-row"><span class="label">${esc(t('settings.upstream'))}</span><span class="value mono">${esc(snap.upstream.repo)}</span></div>
          <div class="env-row"><span class="label">${esc(t('settings.license'))}</span><span class="value mono">${esc(snap.upstream.license)}</span></div>
        </div>
        <p class="small dim mt-12">${esc(t('settings.noAffiliation'))}</p>
        <div class="row mt-12" style="gap:8px;flex-wrap:wrap">
          ${button(t('settings.upstream'), 'noop', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'external', extra: `data-external="${esc(snap.upstream.repo)}"` })}
          ${button(t('settings.openData'), 'open-user-data', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'folder' })}
          ${button(t('console.export'), 'export-diagnostics', { tone: 'btn-ghost', size: 'btn-sm', iconName: 'save' })}
        </div>
      </div>
    </div>
    <div class="side">
      <div class="card">
        ${cardTitle('console', t('settings.keyboard'))}
        <p class="small muted">${esc(t('settings.keyboardText'))}</p>
      </div>
      <div class="card">
        ${cardTitle('external', t('settings.guides'))}
        <p class="small muted">${esc(t('settings.guidesText'))}</p>
        <div class="stack mt-12" style="gap:6px">
          <button class="btn btn-ghost btn-sm" data-external="${esc(snap.urls.deviceGuide)}">${icon('external')}DBY-W09 HOS 4.2 write-up</button>
          <button class="btn btn-ghost btn-sm" data-external="${esc(snap.urls.xdaGuide)}">${icon('external')}XDA DBY-W09 guide</button>
          <button class="btn btn-ghost btn-sm" data-external="${esc(snap.urls.upstream.repo)}">${icon('external')}Upstream source</button>
        </div>
      </div>
      <div class="card">
        ${cardTitle('device', 'DBY-W09')}
        <p class="small muted">Huawei MatePad 11 · Snapdragon 865 · HarmonyOS 2/3/4. ${esc(t('overview.footer'))}</p>
      </div>
    </div>
  </div>`;
}

/* ============================ actions ============================ */

function toast(message, tone = 'info') {
  const root = $('#toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${tone === 'error' ? 'is-error' : tone === 'good' ? 'is-good' : tone === 'warn' ? 'is-warn' : ''}`;
  node.innerHTML = `${icon(tone === 'good' ? 'check' : tone === 'error' ? 'x' : tone === 'warn' ? 'alert' : 'info')}<span>${esc(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(4px)';
    setTimeout(() => node.remove(), 220);
  }, 4200);
}

async function run(fn, { success = '', failure = '' } = {}) {
  try {
    const result = await fn();
    if (result && result.ok === false) throw new Error(result.error || 'Action failed');
    if (success) toast(success, 'good');
    return result;
  } catch (error) {
    toast(failure || error.message || 'Action failed', 'error');
    return null;
  }
}

async function refreshSnapshot() {
  try {
    state.snapshot = await api.snapshot();
    state.logCache = state.snapshot.logs || state.logCache;
  } catch {
    /* ignore */
  }
}

function navigate(next) {
  if (!VIEWS.includes(next)) return;
  state.scroll[state.view] = $('#scroller')?.scrollTop || 0;
  state.view = next;
  state.justNavigated = true;
  render({ preserveScroll: false, focus: true });
}

function handleClick(event) {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }
  const external = event.target.closest('[data-external]');
  if (external) {
    event.preventDefault();
    run(() => api.openExternal(external.dataset.external));
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === 'noop') return;
  handleAction(action, target).catch((error) => toast(error.message || 'Action failed', 'error'));
}

async function handleAction(action, element) {
  const snap = state.snapshot;
  const value = element.dataset.value;
  switch (action) {
    case 'set-language':
      await run(() => api.setLanguage(value), { success: state.t('settings.languageChanged') });
      return;
    case 'set-demo':
      await run(() => api.setDemo(value === 'true'));
      return;
    case 'open-disclaimer':
      showDisclaimer();
      return;
    case 'safety-checklist':
      showSafetyChecklist();
      return;
    case 'refresh':
      await run(() => api.refresh(), { success: state.t('toast.deviceRefreshed') });
      return;
    case 'refresh-device':
      await run(() => api.refreshDevice(), { success: state.t('toast.deviceRefreshed') });
      return;
    case 'detect-edl':
      await run(() => api.detectEdl(), { success: '' });
      return;
    case 'choose-workspace':
      await run(() => api.chooseWorkspace(), { success: state.t('toast.workspaceChanged') });
      return;
    case 'use-existing':
      await run(() => api.useExisting(), { success: state.t('toast.workspaceChanged') });
      return;
    case 'open-workspace':
      await run(() => api.openWorkspace());
      return;
    case 'open-folder':
      await run(() => api.openFolder(element.dataset.kind || 'workspace'));
      return;
    case 'open-user-data':
      await run(() => api.openUserData());
      return;
    case 'reveal-source':
      if (snap.env.toolkit?.csproj) await run(() => api.revealPath(snap.env.toolkit.csproj));
      return;
    case 'reveal-item':
      if (element.dataset.path) await run(() => api.revealPath(element.dataset.path));
      return;
    case 'build':
      state.buildBusy = true;
      render();
      await run(() => api.build(state.forceSource), {
        success: state.t('toast.buildDone'),
        failure: state.t('toast.buildFailed'),
      });
      state.buildBusy = false;
      await refreshSnapshot();
      render();
      return;
    case 'cancel-build':
      await run(() => api.cancelBuild());
      return;
    case 'launch-toolkit':
      await run(() => api.launchToolkit(), { success: state.t('toast.launched') });
      return;
    case 'download': {
      const id = element.dataset.id;
      state.downloads[id] = { phase: 'start', message: 'Starting…', received: 0, total: null };
      updateDownloadUI();
      await run(() => api.installDownload(id), { success: state.t('toast.downloadDone') });
      await refreshSnapshot();
      render();
      return;
    }
    case 'import': {
      const mode = element.dataset.mode || 'zip';
      const result = await run(() => api.importDialog(mode));
      if (result && !result.canceled) {
        state.imports = {
          matched: result.copied?.length || result.runs?.reduce((sum, item) => sum + (item.copied?.length || 0), 0) || 0,
          ignored: result.ignored?.length || 0,
          replaced: result.replaced?.length || 0,
          ambiguous: result.ambiguous || [],
        };
        toast(state.t('toast.importDone'), 'good');
        await refreshSnapshot();
        render();
      }
      return;
    }
    case 'hash-item': {
      const result = await run(() => api.hashItem(element.dataset.id), { success: state.t('toast.hashDone') });
      if (result) {
        await refreshSnapshot();
        render();
      }
      return;
    }
    case 'set-method':
      await run(() => api.setMethod(value));
      await refreshSnapshot();
      render();
      return;
    case 'check-fastboot': {
      const result = await run(() => api.deviceAction('check-fastboot'));
      if (result?.fastboot) {
        const fastboot = result.fastboot;
        if (fastboot.state === 'none') toast(state.t('toast.fastbootNone'), 'warn');
        else if (fastboot.unlocked === true) toast(state.t('toast.bootloaderUnlocked'), 'good');
        else if (fastboot.unlocked === false) toast(state.t('toast.bootloaderLocked'), 'warn');
      }
      await refreshSnapshot();
      render();
      return;
    }
    case 'verify-root': {
      const result = await run(() => api.deviceAction('verify-root'));
      if (result?.root) {
        if (result.root.ok) toast(state.t('toast.rootVerified'), 'good');
        else toast(state.t('toast.rootNotVerified'), 'warn');
      }
      await refreshSnapshot();
      render();
      return;
    }
    case 'install-apk': {
      const kind = element.dataset.kind || snap.state.method;
      const ok = await confirmModal({
        title: state.t('modal.confirm.installTitle'),
        text: state.t('modal.confirm.installText'),
        confirmLabel: state.t('modal.confirm.install'),
        tone: 'btn-primary',
      });
      if (!ok) return;
      await run(() => api.deviceAction('install-apk', { kind }), { success: state.t('toast.apkInstalled') });
      return;
    }
    case 'reboot': {
      const mode = element.dataset.mode;
      if (mode === 'bootloader') {
        const ok = await confirmModal({
          title: state.t('modal.confirm.bootloaderTitle'),
          text: state.t('modal.confirm.bootloaderText'),
          confirmLabel: state.t('modal.confirm.reboot'),
          tone: 'btn-danger',
        });
        if (!ok) return;
      }
      await run(() => api.deviceAction(mode === 'bootloader' ? 'reboot-bootloader' : 'reboot-system'));
      return;
    }
    case 'restart-adb':
      await run(() => api.deviceAction('reconnect'));
      return;
    case 'console-filter':
      state.consoleFilter = value;
      render();
      return;
    case 'toggle-autoscroll':
      state.autoscroll = !state.autoscroll;
      render();
      return;
    case 'copy-logs': {
      const text = (state.logCache || [])
        .filter(logMatches)
        .map((entry) => `[${entry.ts}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`)
        .join('\n');
      await copyText(text || '');
      toast(state.t('toast.copied'), 'good');
      return;
    }
    case 'export-diagnostics': {
      const result = await run(() => api.exportDiagnostics());
      if (result?.path) toast(`${state.t('toast.diagnosticsSaved')}: ${result.path}`, 'good');
      return;
    }
    case 'clear-logs':
      await run(() => api.clearLogs());
      await refreshSnapshot();
      render();
      return;
    case 'reset-progress': {
      const ok = await confirmModal({
        title: state.t('settings.resetConfirmTitle'),
        text: state.t('settings.resetConfirmText'),
        confirmLabel: state.t('settings.resetConfirm'),
        tone: 'btn-danger',
      });
      if (!ok) return;
      await run(() => api.resetProgress(), { success: state.t('toast.resetDone') });
      await refreshSnapshot();
      render();
      return;
    }
    case 'open-path':
      if (element.dataset.path) await run(() => api.openPath(element.dataset.path));
      return;
    default:
      return;
  }
}

function handleChange(event) {
  const input = event.target;
  if (input.id === 'force-source') {
    state.forceSource = input.checked;
    return;
  }
  if (input.id === 'wipe-backup') {
    state.wipeBackup = input.checked;
    const form = $('#wipe-form');
    const buttonEl = form?.querySelector('button[type="submit"]');
    if (buttonEl) buttonEl.disabled = !(state.wipePhrase.trim().toUpperCase() === 'WIPE' && state.wipeBackup);
    return;
  }
  if (input.matches('[data-step-flow]')) {
    const flow = input.dataset.stepFlow;
    const id = input.dataset.stepId;
    const method = input.dataset.stepMethod || undefined;
    const complete = input.dataset.stepComplete === 'true';
    const key = stepKey(flow, id, method);
    const done = input.checked;
    state.snapshot.state.progress[flow].steps[key] = done;
    if (complete) {
      state.snapshot.state.progress[flow].completed = done;
      state.snapshot.state.progress[flow].completedAt = done ? new Date().toISOString() : null;
    }
    render();
    run(() => api.guideStep(flow, key, done, complete)).catch(() => {});
    return;
  }
}

function handleSubmit(event) {
  if (event.target.id !== 'wipe-form') return;
  event.preventDefault();
  const phrase = $('#wipe-phrase')?.value || state.wipePhrase;
  const backup = Boolean($('#wipe-backup')?.checked);
  state.wipePhrase = phrase;
  state.wipeBackup = backup;
  if (phrase.trim().toUpperCase() !== 'WIPE') {
    toast(state.t('unlock.wipePhrase'), 'warn');
    return;
  }
  if (!backup) {
    toast(state.t('unlock.backupRequired'), 'warn');
    return;
  }
  run(() => api.ackWipe(phrase, backup), { success: state.t('toast.ackRecorded') })
    .then(async (result) => {
      if (result) {
        state.wipePhrase = '';
        state.wipeBackup = false;
        await refreshSnapshot();
        render();
      }
    })
    .catch(() => {});
}

function handleInput(event) {
  const input = event.target;
  if (input.id === 'wipe-phrase') {
    state.wipePhrase = input.value;
    const form = $('#wipe-form');
    const buttonEl = form?.querySelector('button[type="submit"]');
    if (buttonEl) buttonEl.disabled = !(input.value.trim().toUpperCase() === 'WIPE' && (state.wipeBackup || $('#wipe-backup')?.checked));
    return;
  }
  if (input.id === 'console-search') {
    state.consoleQuery = input.value;
    const body = $('#console-body');
    if (body) body.innerHTML = consoleRows();
    return;
  }
  if (event.target.closest('[data-build-log]')) return;
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    return;
  }
  if (event.altKey && /^[1-8]$/.test(event.key)) {
    event.preventDefault();
    navigate(VIEWS[Number(event.key) - 1]);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]')) {
    event.preventDefault();
    event.target.click();
  }
}

function showDisclaimer({ safetyOnly = false } = {}) {
  const dialog = $('#modal');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  const t = state.t;
  dialog.innerHTML = `<div class="modal-card">
    <div class="modal-head">
      <div class="eyebrow">${esc(t('modal.disclaimer.eyebrow'))}</div>
      <h2 style="font-size:20px;line-height:1.25">${esc(t('modal.disclaimer.title'))}</h2>
    </div>
    <div class="modal-body">
      <ul class="modal-list">
        <li>${icon('alert')}<span>${esc(t('modal.disclaimer.item1'))}</span></li>
        <li>${icon('alert')}<span>${esc(t('modal.disclaimer.item2'))}</span></li>
        <li>${icon('alert')}<span>${esc(t('modal.disclaimer.item3'))}</span></li>
        <li>${icon('info')}<span>${esc(t('modal.disclaimer.item4'))}</span></li>
      </ul>
      ${
        safetyOnly
          ? ''
          : `<label class="modal-check"><input type="checkbox" id="disclaimer-accept"> <span>${esc(t('modal.disclaimer.accept'))}</span></label>`
      }
    </div>
    <div class="modal-foot">
      ${safetyOnly ? `<button class="btn btn-ghost" id="modal-close">${esc(t('common.close'))}</button>` : `<button class="btn btn-ghost" id="modal-later">${esc(t('modal.disclaimer.later'))}</button><button class="btn btn-primary" id="modal-accept" disabled>${esc(t('modal.disclaimer.continue'))}</button>`}
    </div>
  </div>`;
  dialog.showModal();
  state.modalOpen = true;
  if (safetyOnly) {
    $('#modal-close').addEventListener('click', () => dialog.close());
    return;
  }
  $('#disclaimer-accept').addEventListener('change', (event) => {
    $('#modal-accept').disabled = !event.target.checked;
  });
  $('#modal-later').addEventListener('click', () => dialog.close());
  $('#modal-accept').addEventListener('click', async () => {
    const result = await run(() => api.ackDisclaimer(true));
    if (result) {
      dialog.close();
      await refreshSnapshot();
      render();
    }
  });
}

function showSafetyChecklist() {
  const dialog = $('#modal');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  const t = state.t;
  const items = [t('unlock.never1'), t('unlock.never2'), t('unlock.never3'), t('unlock.never4')];
  dialog.innerHTML = `<div class="modal-card">
    <div class="modal-head"><div class="eyebrow">${esc(t('unlock.neverTitle'))}</div><h2 style="font-size:19px">${esc(t('modal.safety.title'))}</h2></div>
    <div class="modal-body">
      <p class="small dim">${esc(t('modal.safety.note'))}</p>
      <ul class="modal-list">${items.map((text) => `<li>${icon('x')}<span>${esc(text)}</span></li>`).join('')}</ul>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" id="safety-close">${esc(t('common.close'))}</button></div>
  </div>`;
  dialog.showModal();
  state.modalOpen = true;
  $('#safety-close').addEventListener('click', () => dialog.close());
}

function confirmModal({ title, text, confirmLabel, tone = 'btn-primary' }) {
  return new Promise((resolve) => {
    const dialog = $('#modal');
    if (!dialog) return resolve(false);
    if (dialog.open) dialog.close();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (dialog.open) dialog.close();
    };
    dialog.innerHTML = `<div class="modal-card">
      <div class="modal-head"><div class="eyebrow">${esc(state.t('modal.disclaimer.eyebrow'))}</div><h2 style="font-size:19px">${esc(title)}</h2></div>
      <div class="modal-body"><p>${esc(text)}</p></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="confirm-cancel">${esc(state.t('common.cancel'))}</button>
        <button class="btn ${tone}" id="confirm-ok">${esc(confirmLabel || state.t('common.continue'))}</button>
      </div>
    </div>`;
    dialog.showModal();
    state.modalOpen = true;
    $('#confirm-cancel').addEventListener('click', () => finish(false));
    $('#confirm-ok').addEventListener('click', () => finish(true));
    dialog.addEventListener('close', () => finish(false), { once: true });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function handleEvent(message) {
  if (!message || !message.type) return;
  if (message.type === 'log') {
    const entry = message.payload;
    state.logCache.push(entry);
    if (state.logCache.length > 800) state.logCache.splice(0, state.logCache.length - 800);
    if (state.view === 'console') {
      const body = $('#console-body');
      if (body && logMatches(entry)) {
        if (body.querySelector('.console-empty')) body.innerHTML = '';
        body.insertAdjacentHTML('beforeend', logRow(entry));
        if (state.autoscroll) body.scrollTop = body.scrollHeight;
      }
    }
    const buildLog = $('[data-build-log]');
    if (buildLog && entry.source === 'build') {
      buildLog.insertAdjacentHTML('beforeend', logRow(entry));
      if (state.buildProgress?.phase) buildLog.scrollTop = buildLog.scrollHeight;
    }
    return;
  }
  if (message.type === 'download-progress') {
    state.downloads[message.payload.id] = message.payload;
    updateDownloadUI();
    return;
  }
  if (message.type === 'build-progress') {
    state.buildProgress = message.payload;
    const label = $('[data-build-message]');
    if (label) label.textContent = message.payload.message || '';
    return;
  }
  if (message.type === 'snapshot') {
    state.snapshot = message.payload;
    state.logCache = message.payload.logs || state.logCache;
    if (!state.shellReady) return;
    render({ preserveScroll: true });
    if (!state.snapshot.state.acknowledgements.disclaimer && !state.disclaimerPrompted && !$('#modal')?.open) {
      state.disclaimerPrompted = true;
      setTimeout(showDisclaimer, 250);
    }
  }
}

function updateDownloadUI() {
  for (const [id, progress] of Object.entries(state.downloads)) {
    const card = $(`[data-download-card="${id}"]`);
    if (!card) continue;
    const meter = card.querySelector('.meter > span');
    const stateLabel = card.querySelector('[data-download-state]');
    if (progress.total && progress.received) {
      const pct = Math.max(2, Math.min(100, Math.round((progress.received / progress.total) * 100)));
      if (meter) meter.style.width = `${pct}%`;
    } else if (progress.phase === 'done') {
      if (meter) meter.style.width = '100%';
    }
    if (stateLabel) stateLabel.textContent = progress.message || progress.phase || '';
  }
}

function setupDropzone() {
  const overlay = $('#drop-overlay');
  let depth = 0;
  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (state.view !== 'tools') return;
    depth += 1;
    overlay.classList.add('is-on');
  });
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  window.addEventListener('dragleave', (event) => {
    event.preventDefault();
    if (state.view !== 'tools') return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.classList.remove('is-on');
  });
  window.addEventListener('drop', async (event) => {
    event.preventDefault();
    if (state.view !== 'tools') return;
    depth = 0;
    overlay.classList.remove('is-on');
    const files = [...(event.dataTransfer?.files || [])];
    const paths = files.map((file) => api.getPathForFile(file)).filter(Boolean);
    if (!paths.length) return;
    const imageOnly = paths.every((file) => /\.img$/i.test(file));
    const result = await run(() => api.importPaths(paths, imageOnly ? 'ramdisk' : 'toolpack'), {
      success: state.t('toast.importDone'),
    });
    if (result) {
      const runs = result.runs || [];
      state.imports = {
        matched: runs.reduce((sum, item) => sum + (item.copied?.length || 0), 0),
        ignored: runs.reduce((sum, item) => sum + (item.ignored?.length || 0), 0),
        replaced: runs.reduce((sum, item) => sum + (item.replaced?.length || 0), 0),
        ambiguous: runs.flatMap((item) => item.ambiguous || []),
      };
      await refreshSnapshot();
      render();
    }
  });
}

boot();
