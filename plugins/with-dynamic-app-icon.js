const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest } = require("expo/config-plugins");

// ─── Android icon sizes ──────────────────────────────────────────────────────
const DPI_VALUES = {
  mdpi: { folder: "mipmap-mdpi", scale: 1, legacySize: 48, adaptiveSize: 108 },
  hdpi: { folder: "mipmap-hdpi", scale: 1.5, legacySize: 72, adaptiveSize: 162 },
  xhdpi: { folder: "mipmap-xhdpi", scale: 2, legacySize: 96, adaptiveSize: 216 },
  xxhdpi: { folder: "mipmap-xxhdpi", scale: 3, legacySize: 144, adaptiveSize: 324 },
  xxxhdpi: { folder: "mipmap-xxxhdpi", scale: 4, legacySize: 192, adaptiveSize: 432 },
};

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

  config = withDangerousMod(config, ["android", async (config) => {
    const projectRoot = config.modRequest.platformProjectRoot;
    await generateAndroidLightResources(projectRoot);
    return config;
  }]);

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

  // Dark alias (enabled by default) — uses Expo-generated ic_launcher resources
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

// ─── Android: generate light icon resources ──────────────────────────────────
async function generateAndroidLightResources(androidProjectRoot) {
  const resPath = path.join(androidProjectRoot, ANDROID_RES_PATH);
  const projectRoot = path.resolve(androidProjectRoot, "..");
  const lightIconSrc = path.join(projectRoot, "assets/images/applogortvfontana.png");
  const lightForegroundSrc = path.join(projectRoot, "assets/adaptive-icon-foreground.png");

  if (!fs.existsSync(lightIconSrc)) throw new Error(`Missing light icon source: ${lightIconSrc}`);
  if (!fs.existsSync(lightForegroundSrc)) throw new Error(`Missing light foreground source: ${lightForegroundSrc}`);

  // Ensure output directories exist
  for (const { folder } of Object.values(DPI_VALUES)) {
    await fs.promises.mkdir(path.join(resPath, folder), { recursive: true });
  }
  await fs.promises.mkdir(path.join(resPath, "mipmap-anydpi-v26"), { recursive: true });

  // Generate legacy icons and round icons from applogortvfontana.png
  for (const { folder, legacySize } of Object.values(DPI_VALUES)) {
    const outSquare = path.join(resPath, folder, "ic_launcher_light.webp");
    const outRound = path.join(resPath, folder, "ic_launcher_light_round.webp");
    await convertImage(lightIconSrc, outSquare, legacySize, legacySize);
    await convertImageRounded(lightIconSrc, outRound, legacySize, legacySize);
  }

  // Generate adaptive foreground from adaptive-icon-foreground.png
  for (const { folder, adaptiveSize } of Object.values(DPI_VALUES)) {
    const outForeground = path.join(resPath, folder, "ic_launcher_foreground_light.webp");
    await convertImage(lightForegroundSrc, outForeground, adaptiveSize, adaptiveSize);
  }

  // Create adaptive icon XML files
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackgroundLight"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground_light"/>
</adaptive-icon>`;

  await fs.promises.writeFile(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher_light.xml"),
    adaptiveXml,
    "utf8"
  );
  await fs.promises.writeFile(
    path.join(resPath, "mipmap-anydpi-v26", "ic_launcher_light_round.xml"),
    adaptiveXml,
    "utf8"
  );

  // Add light background color to colors.xml
  const colorsXmlPath = path.join(resPath, "values", "colors.xml");
  if (fs.existsSync(colorsXmlPath)) {
    let colorsContent = await fs.promises.readFile(colorsXmlPath, "utf8");
    if (!colorsContent.includes("iconBackgroundLight")) {
      colorsContent = colorsContent.replace(
        "</resources>",
        `    <color name="iconBackgroundLight">#ffffff</color>\n</resources>`
      );
      await fs.promises.writeFile(colorsXmlPath, colorsContent, "utf8");
    }
  }
}

// ─── Image helpers ───────────────────────────────────────────────────────────
function execAsync(command) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    exec(command, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}\n${stderr}`));
      else resolve(stdout);
    });
  });
}

async function convertImage(src, dest, width, height) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await execAsync(`convert "${src}" -resize ${width}x${height}^ -gravity center -extent ${width}x${height} "${dest}"`);
}

async function convertImageRounded(src, dest, width, height) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const radius = Math.round(width / 2);
  await execAsync(
    `convert "${src}" -resize ${width}x${height}^ -gravity center -extent ${width}x${height} ` +
    `\\( -size ${width}x${height} xc:black -fill white -draw "ellipse ${radius},${radius} ${radius},${radius} 0,360" \\) ` +
    `-compose CopyOpacity -composite "${dest}"`
  );
}
