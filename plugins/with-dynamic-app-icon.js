const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest, withXcodeProject } = require("expo/config-plugins");

// ─── iOS alternate icon ──────────────────────────────────────────────────────
// Apple-supported mechanism (Xcode 13+): a LightIcon.appiconset inside the
// app target's Images.xcassets, plus two build settings. actool then
// GENERATES the CFBundleIcons/CFBundleAlternateIcons Info.plist entries at
// build time from the catalog contents.
//
// Do NOT hand-write CFBundleIcons into Info.plist: a plist entry that doesn't
// exactly match a compiled catalog asset is rejected at upload with
// ITMS-90895 ("LightIcon isn't resolvable as a catalog asset") — that is
// what killed the previous attempt. The catalog + build settings are the
// single source of truth.
const IOS_ALTERNATE_ICON_NAME = "LightIcon";
const IOS_ICON_SOURCE_DIR = path.join("assets", "app-icons", "ios", "LightIcon");

// Full iPhone appiconset matrix + marketing icon (matches the files produced
// by scripts/generate_ios_alternate_icon.py).
const IOS_APPICONSET_IMAGES = [
  { filename: "Icon-App-20x20@2x.png", idiom: "iphone", scale: "2x", size: "20x20" },
  { filename: "Icon-App-20x20@3x.png", idiom: "iphone", scale: "3x", size: "20x20" },
  { filename: "Icon-App-29x29@2x.png", idiom: "iphone", scale: "2x", size: "29x29" },
  { filename: "Icon-App-29x29@3x.png", idiom: "iphone", scale: "3x", size: "29x29" },
  { filename: "Icon-App-40x40@2x.png", idiom: "iphone", scale: "2x", size: "40x40" },
  { filename: "Icon-App-40x40@3x.png", idiom: "iphone", scale: "3x", size: "40x40" },
  { filename: "Icon-App-60x60@2x.png", idiom: "iphone", scale: "2x", size: "60x60" },
  { filename: "Icon-App-60x60@3x.png", idiom: "iphone", scale: "3x", size: "60x60" },
  { filename: "Icon-App-1024x1024@1x.png", idiom: "ios-marketing", scale: "1x", size: "1024x1024" },
];

// ─── Android icon sizes ──────────────────────────────────────────────────────
const DPI_VALUES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

const ANDROID_RES_PATH = "app/src/main/res";

function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// ─── Plugin entry ────────────────────────────────────────────────────────────
module.exports = function withDynamicAppIcon(config) {
  config = withAndroidManifest(config, (config) => {
    config.modResults = modifyAndroidManifest(config.modResults, config.android?.package || config.package);
    return config;
  });

  config = withDangerousMod(config, ["android", (config) => {
    const projectRoot = config.modRequest.platformProjectRoot;
    copyAndroidIconResources(projectRoot);
    return config;
  }]);

  // ─── iOS: copy LightIcon.appiconset into Images.xcassets ─────────────────
  config = withDangerousMod(config, ["ios", (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const projectName = config.modRequest.projectName;
    const sourceDir = path.join(projectRoot, IOS_ICON_SOURCE_DIR);
    const appiconsetDir = path.join(
      config.modRequest.platformProjectRoot,
      projectName,
      "Images.xcassets",
      `${IOS_ALTERNATE_ICON_NAME}.appiconset`,
    );

    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        `Missing iOS alternate icon sources: ${IOS_ICON_SOURCE_DIR}. ` +
        `Run scripts/generate_ios_alternate_icon.py first.`,
      );
    }

    fs.mkdirSync(appiconsetDir, { recursive: true });
    for (const image of IOS_APPICONSET_IMAGES) {
      fs.copyFileSync(path.join(sourceDir, image.filename), path.join(appiconsetDir, image.filename));
    }
    fs.writeFileSync(
      path.join(appiconsetDir, "Contents.json"),
      JSON.stringify(
        {
          images: IOS_APPICONSET_IMAGES,
          info: { author: "xcode", version: 1 },
        },
        null,
        2,
      ),
      "utf8",
    );
    return config;
  }]);

  // ─── iOS: Xcode build settings so actool compiles + declares the icon ────
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key].buildSettings;
      if (!buildSettings) continue;
      buildSettings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = "YES";
      const existing = buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES;
      const names = new Set((typeof existing === "string" ? existing.split(/\s+/) : []).filter(Boolean));
      names.add(IOS_ALTERNATE_ICON_NAME);
      buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = Array.from(names).join(" ");
    }
    return config;
  });

  return config;
};

// ─── Android: modify manifest ────────────────────────────────────────────────
function modifyAndroidManifest(manifest, packageName) {
  const application = manifest?.manifest?.application?.[0];
  if (!application) return manifest;

  const mainActivityName = ".MainActivity";
  const mainActivityFullName = packageName ? `${packageName}${mainActivityName}` : mainActivityName;

  // Find MainActivity and remove its LAUNCHER intent-filter.
  const activities = ensureArray(application.activity);
  const mainActivity = activities.find((a) => {
    const name = a.$?.["android:name"] || "";
    return name === mainActivityName || name === mainActivityFullName;
  });

  if (mainActivity) {
    const filters = ensureArray(mainActivity["intent-filter"]);
    mainActivity["intent-filter"] = filters.filter((filter) => {
      const actions = ensureArray(filter.action);
      const categories = ensureArray(filter.category);
      const hasMain = actions.some((a) => a.$?.["android:name"] === "android.intent.action.MAIN");
      const hasLauncher = categories.some((c) => c.$?.["android:name"] === "android.intent.category.LAUNCHER");
      return !(hasMain && hasLauncher);
    });
  }

  // Manage activity aliases
  const aliases = ensureArray(application["activity-alias"]);
  const managedAliases = aliases.filter((a) => {
    const name = a.$?.["android:name"] || "";
    return name !== ".MainActivity" && name !== ".MainActivityLight";
  });

  // Dark alias (enabled by default) — uses ic_launcher resources
  managedAliases.push({
    $: {
      "android:name": ".MainActivity",
      "android:targetActivity": mainActivityName,
      "android:enabled": "true",
      "android:exported": "true",
      "android:icon": "@mipmap/ic_launcher",
      "android:roundIcon": "@mipmap/ic_launcher_round",
      "android:label": "@string/app_name",
    },
    "intent-filter": [
      {
        action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
        category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
      },
    ],
  });

  // Light alias (disabled by default)
  managedAliases.push({
    $: {
      "android:name": ".MainActivityLight",
      "android:targetActivity": mainActivityName,
      "android:enabled": "false",
      "android:exported": "true",
      "android:icon": "@mipmap/ic_launcher_light",
      "android:roundIcon": "@mipmap/ic_launcher_light_round",
      "android:label": "@string/app_name",
    },
    "intent-filter": [
      {
        action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
        category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
      },
    ],
  });

  application["activity-alias"] = managedAliases;
  application.activity = activities;

  return manifest;
}

// ─── Android: copy pre-generated icon resources ──────────────────────────────
function copyAndroidIconResources(androidProjectRoot) {
  const resPath = path.join(androidProjectRoot, ANDROID_RES_PATH);
  const projectRoot = path.resolve(androidProjectRoot, "..");
  const pregenRoot = path.join(projectRoot, "assets/app-icons");

  // ── Ensure output directories exist ──
  for (const dpi of DPI_VALUES) {
    fs.mkdirSync(path.join(resPath, `mipmap-${dpi}`), { recursive: true });
  }
  fs.mkdirSync(path.join(resPath, "mipmap-anydpi-v26"), { recursive: true });
  fs.mkdirSync(path.join(resPath, "values"), { recursive: true });

  // ── Copy dark icons (legacy + round + foreground) ──
  for (const dpi of DPI_VALUES) {
    const srcDir = path.join(pregenRoot, "dark", dpi);
    const dstDir = path.join(resPath, `mipmap-${dpi}`);
    fs.copyFileSync(path.join(srcDir, "ic_launcher.webp"), path.join(dstDir, "ic_launcher.webp"));
    fs.copyFileSync(path.join(srcDir, "ic_launcher_round.webp"), path.join(dstDir, "ic_launcher_round.webp"));
    fs.copyFileSync(path.join(srcDir, "ic_launcher_foreground.webp"), path.join(dstDir, "ic_launcher_foreground.webp"));
  }

  // ── Copy light icons (legacy + round + foreground) ──
  for (const dpi of DPI_VALUES) {
    const srcDir = path.join(pregenRoot, "light", dpi);
    const dstDir = path.join(resPath, `mipmap-${dpi}`);
    fs.copyFileSync(path.join(srcDir, "ic_launcher_light.webp"), path.join(dstDir, "ic_launcher_light.webp"));
    fs.copyFileSync(path.join(srcDir, "ic_launcher_light_round.webp"), path.join(dstDir, "ic_launcher_light_round.webp"));
    fs.copyFileSync(path.join(srcDir, "ic_launcher_foreground_light.webp"), path.join(dstDir, "ic_launcher_foreground_light.webp"));
  }

  // ── Write dark adaptive icon XML (points to pre-generated foreground) ──
  const darkAdaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  fs.writeFileSync(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher.xml"),
    darkAdaptiveXml,
    "utf8"
  );
  fs.writeFileSync(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher_round.xml"),
    darkAdaptiveXml,
    "utf8"
  );

  // ── Write light adaptive icon XML ──
  const lightAdaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackgroundLight"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground_light"/>
</adaptive-icon>`;

  fs.writeFileSync(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher_light.xml"),
    lightAdaptiveXml,
    "utf8"
  );
  fs.writeFileSync(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher_light_round.xml"),
    lightAdaptiveXml,
    "utf8"
  );

  // ── Ensure background colors exist in colors.xml ──
  const colorsXmlPath = path.join(resPath, "values", "colors.xml");
  let colorsContent = fs.existsSync(colorsXmlPath)
    ? fs.readFileSync(colorsXmlPath, "utf8")
    : `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>`;

  if (!colorsContent.includes("iconBackground")) {
    colorsContent = colorsContent.replace(
      "</resources>",
      `    <color name="iconBackground">#0B1220</color>\n</resources>`
    );
  }
  if (!colorsContent.includes("iconBackgroundLight")) {
    colorsContent = colorsContent.replace(
      "</resources>",
      `    <color name="iconBackgroundLight">#ffffff</color>\n</resources>`
    );
  }
  fs.writeFileSync(colorsXmlPath, colorsContent, "utf8");
}
