// Rewrite a Windows .exe's icon + version metadata (no Wine needed).
// usage: node brand_exe.js <exe> <ico> <ProductName> <FileDescription> <CompanyName> <OriginalFilename> <version>
const fs = require('fs');
const ResEdit = require('resedit');

const [, , exePath, icoPath, productName, fileDesc, company, origName, version] = process.argv;
const parts = version.split('.').map(Number);
while (parts.length < 4) parts.push(0);

const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);

// ── icon ──
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries, 1, 1033,
  iconFile.icons.map((i) => i.data)
);

// ── version info ──
const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = viList.length ? viList[0] : ResEdit.Resource.VersionInfo.createEmpty();
vi.setFileVersion(parts[0], parts[1], parts[2], parts[3], 1033);
vi.setProductVersion(parts[0], parts[1], parts[2], parts[3], 1033);
vi.removeAllStringValues({ lang: 1033, codepage: 1200 });
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  CompanyName: company,
  FileDescription: fileDesc,
  FileVersion: version,
  InternalName: origName.replace(/\.exe$/i, ''),
  LegalCopyright: `Copyright (C) ${new Date().getFullYear()} ${company}`,
  OriginalFilename: origName,
  ProductName: productName,
  ProductVersion: version,
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('branded:', exePath);
