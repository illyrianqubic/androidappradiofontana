const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest, withInfoPlist, withXcodeProject } = require("expo/config-plugins");

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

  // ─── iOS: inject CFBundleAlternateIcons into Info.plist ─────────────────
  config = withInfoPlist(config, (config) => {
    config.modResults.CFBundleIcons = {
      CFBundlePrimaryIcon: {
        CFBundleIconFiles: ['AppIcon'],
        CFBundleIconName: 'AppIcon',
      },
      CFBundleAlternateIcons: {
        // Key 'LightIcon' must match the string passed to
        // setAlternateIconName() in DynamicAppIconModule.swift
        LightIcon: {
          CFBundleIconFiles: ['LightIcon'],
          CFBundleIconName: 'LightIcon',
        },
      },
    };
    return config;
  });

  // ─── iOS: copy PNG assets into Xcode project directory ──────────────────
  config = withDangerousMod(config, ['ios', (config) => {
    const iosRoot = config.modRequest.platformProjectRoot; // .../ios/
    const projectName = config.modRequest.projectName;     // e.g. "rtvfontana"
    const destDir = path.join(iosRoot, projectName);
    const srcDir = path.resolve(
      config.modRequest.projectRoot,
      'assets/app-icons/ios'
    );

    const files = ['LightIcon@2x.png', 'LightIcon@3x.png'];
    for (const file of files) {
      const src = path.join(srcDir, file);
      const dest = path.join(destDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      } else {
        console.warn(`[with-dynamic-app-icon] iOS asset not found: ${src}`);
      }
    }
    return config;
  }]);

  // ─── iOS: register PNG files in Xcode Resources build phase ─────────────
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const targetUUID = xcodeProject.getFirstTarget()?.uuid;
    if (!targetUUID) return config;

    // BUG FIX: addResourceFile's path must be relative to the .xcodeproj
    // (ios/), matching every other file in the same group — the group
    // itself carries no `path`, so AppDelegate.swift/Info.plist/etc. are
    // all registered as "ProjectName/<file>", not bare filenames. A bare
    // filename here resolved to ios/<file>, while the withDangerousMod
    // step above copies the PNGs to ios/<ProjectName>/<file> — that
    // mismatch is exactly what produces Xcode's "Build input file cannot
    // be found" at build time. Verified by running `expo prebuild` and
    // comparing the generated project.pbxproj's PBXFileReference entries.
    const projectName = config.modRequest.projectName;
    const files = ['LightIcon@2x.png', 'LightIcon@3x.png'];
    for (const file of files) {
      const relativePath = path.join(projectName, file);
      // Check if already registered (idempotent — safe to re-run)
      const refs = xcodeProject.pbxFileReferenceSection() || {};
      const alreadyAdded = Object.values(refs).some(
        (ref) =>
          ref &&
          typeof ref === 'object' &&
          (ref.path === relativePath || ref.path === `"${relativePath}"`)
      );
      if (!alreadyAdded) {
        xcodeProject.addResourceFile(relativePath, { target: targetUUID });
      }
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
