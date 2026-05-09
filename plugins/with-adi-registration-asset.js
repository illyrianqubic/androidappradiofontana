const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const TOKEN_FILE = "adi-registration.properties";
const TOKEN_SOURCE = path.join("assets", TOKEN_FILE);
const TOKEN_DESTINATION = path.join("app", "src", "main", "assets", TOKEN_FILE);

module.exports = function withAdiRegistrationAsset(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const androidProjectRoot = modConfig.modRequest.platformProjectRoot;
      const source = path.join(projectRoot, TOKEN_SOURCE);
      const destination = path.join(androidProjectRoot, TOKEN_DESTINATION);

      if (!fs.existsSync(source)) {
        throw new Error(`Missing required Play Console token file: ${TOKEN_SOURCE}`);
      }

      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(source, destination);

      return modConfig;
    },
  ]);
};
