// ─────────────────────────────────────────────────────────────────────────────
//  BRAND CONFIG — one codebase, two shipped apps.
//  Brand is chosen from (in order):
//    1. process.env.BRAND            (dev:  BRAND=faisal npm start)
//    2. a bundled ./brandlock.js     (baked into each packaged build)
//    3. default = haramain
// ─────────────────────────────────────────────────────────────────────────────
const BRANDS = {
  haramain: {
    id: 'haramain', appId: 'com.haramain.marketing',
    name: 'Haramain Marketing Services', shortName: 'Haramain',
    accent: '#1d4f91', accentSoft: '#0e2a4f',   // navy, taken from the HM logo
    billPrefix: 'HMS', loadPrefix: 'HL', returnPrefix: 'HR', dbFile: 'haramain-marketing.db',
    logoFile: 'logo-haramain.png', iconFile: 'icon-haramain.png',
    // Pre-filled business details — the owner can change them in Settings.
    settings: {
      business_address: 'H#23, Railway Scheme IV, Chaklala, Rawalpindi, Pakistan',
      business_phone: '03073976382',
      business_ntn: '4216176-2',
      business_gst: '32-77-8761-761-26',
      gst_rate: '18',
    },
  },
  faisal: {
    id: 'faisal', appId: 'com.faisal.enterprises',
    name: 'Faisal Enterprises', shortName: 'Faisal',
    accent: '#b01f24', accentSoft: '#4a1113',   // red, taken from the FE logo
    billPrefix: 'FE', loadPrefix: 'FL', returnPrefix: 'FR', dbFile: 'faisal-enterprises.db',
    logoFile: 'logo-faisal.png', iconFile: 'icon-faisal.png',
    settings: {
      business_address: 'IJP Road, Khayaban-e-Sir Syed, Rawalpindi',
      business_phone: '0314-5360901, 0333-1550788',
      business_ntn: 'J617125-4',
      business_gst: '',
      gst_rate: '18',
    },
    // This edition used to ship as "Moon Marketing Services" — copy its data on first run.
    legacy: { name: 'Moon Marketing Services', dbFile: 'moon-marketing.db' },
  },
};
BRANDS.moon = BRANDS.faisal;   // old key keeps working

function getActiveBrand() {
  let key = (process.env.BRAND || '').toLowerCase();
  if (!key) { try { key = String(require('./brandlock')).toLowerCase().trim(); } catch (e) {} }
  return BRANDS[key] || BRANDS.haramain;
}

module.exports = { BRANDS, getActiveBrand };
