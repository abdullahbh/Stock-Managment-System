// Build config — one command per brand:
//   npm run build:haramain   ->  dist/Haramain Marketing Services Setup.exe (+ portable)
//   npm run build:moon       ->  dist/Moon Marketing Services Setup.exe    (+ portable)
const { BRANDS } = require('./brand.config');
const brand = BRANDS[(process.env.BRAND || 'haramain').toLowerCase()] || BRANDS.haramain;

module.exports = {
  appId: brand.appId,
  productName: brand.name,
  directories: { output: `dist/${brand.id}` },
  files: [
    "main.js",
    "preload.js",
    "database.js",
    "db-worker.js",
    "brand.config.js",
    "brandlock.js",
    "renderer-dist/**/*",
    "assets/**/*",
    "build/**/*",
    "node_modules/**/*",
    "package.json"
  ],
  asar: true,
  // the db worker thread has no asar support, so it and everything it requires must be real files
  asarUnpack: ["node_modules/better-sqlite3/**", "node_modules/bindings/**", "node_modules/file-uri-to-path/**", "db-worker.js", "database.js"],
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] }
    ],
    icon: `build/icon-${brand.id}.ico`
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: brand.name
  },
  portable: {
    artifactName: `${brand.shortName}-Portable.exe`
  }
};
