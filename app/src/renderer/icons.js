const wrap = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  logo: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4.2" y="3" width="15.6" height="18" rx="2.6" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8.6 14.6h6.8M9.6 14.6v2.2M14.4 14.6v2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12.8 6.5 9.7 11h2.8l-1.2 3.4 3.4-4.9h-2.7l.8-3Z" fill="currentColor"/>
  </svg>`,
  overview: wrap('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="4.5" rx="1.8"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  prepare: wrap('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
  tools: wrap('<path d="M14.5 6.5a4.2 4.2 0 0 1 5-5l-2.3 2.3 2 2 2.3-2.3a4.2 4.2 0 0 1-5 5L9 16v3H6l-3 3v-3l7.5-7.5a4.2 4.2 0 0 1 4-5Z" transform="translate(0 1)"/>'),
  device: wrap('<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 5.5h3M11 18.5h2"/>'),
  unlock: wrap('<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/><circle cx="12" cy="15.4" r="1.35"/><path d="M12 16.7v1.6"/>'),
  root: wrap('<path d="M12 3 4.5 6.3v5.2c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6.3L12 3Z"/><path d="m8.8 12 2.1 2.1 4.4-4.4"/>'),
  console: wrap('<rect x="3" y="4" width="18" height="16" rx="2.2"/><path d="m7 9 2.5 2.5L7 14M12.5 15h4.5"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64h.09A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>'),
  check: wrap('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  alert: wrap('<path d="M12 3.5 22 20H2L12 3.5Z"/><path d="M12 9v5M12 17.2v.1"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>'),
  x: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  download: wrap('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
  upload: wrap('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
  folder: wrap('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'),
  file: wrap('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/>'),
  refresh: wrap('<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 4v7h-7"/>'),
  external: wrap('<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19V7.8A1.8 1.8 0 0 1 5.8 6H11"/>'),
  copy: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  hash: wrap('<path d="M10 3 8 21M16 3l-2 18M3.5 9h17M3 15h17"/>'),
  play: wrap('<path d="M7 4.5 19.5 12 7 19.5v-15Z"/>'),
  stop: wrap('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  lock: wrap('<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  battery: wrap('<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10v4M5.5 10v4"/>'),
  shield: wrap('<path d="M12 3 4.5 6.3v5.2c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6.3L12 3Z"/>'),
  zap: wrap('<path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z"/>'),
  cable: wrap('<path d="M4 4v5a3 3 0 0 0 3 3h2M20 20v-5a3 3 0 0 0-3-3h-2"/><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="18" y="18" width="4" height="4" rx="1"/><path d="M9 12h6"/>'),
  arrowRight: wrap('<path d="M4 12h16M14 6l6 6-6 6"/>'),
  clock: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  package: wrap('<path d="m12 2.8 8.5 4.7v9L12 21.2l-8.5-4.7v-9L12 2.8Z"/><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 21v-8.8"/>'),
  terminal: wrap('<rect x="3" y="4" width="18" height="16" rx="2.2"/><path d="m7 9 2.5 2.5L7 14M12.5 15h4.5"/>'),
  trash: wrap('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>'),
  save: wrap('<path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 15h8"/>'),
  chevron: wrap('<path d="m9 6 6 6-6 6"/>'),
  usb: wrap('<path d="M12 21V7M12 7l3-3M12 7 9 4"/><circle cx="12" cy="21" r="1.4"/><path d="M12 13h5l2-2M12 16H7l-2-2"/>'),
  eye: wrap('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  layers: wrap('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>'),
  wifi: wrap('<path d="M3 8.5a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: wrap('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.1-2.7 4M12 17.2v.1"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  minus: wrap('<path d="M5 12h14"/>'),
};

export function icon(name) {
  return ICONS[name] || ICONS.info;
}
