const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const DOMAIN_SRC = path.resolve(
  __dirname,
  "../../../packages/domain-apple/Sources/SiestaDomain"
);
const DEST = path.resolve(__dirname, "../targets/watch/Domain");

/**
 * The watch target is an Xcode filesystem-synchronized group: every .swift
 * file under targets/watch/ is compiled into it. Copying the canonical Swift
 * domain here at prebuild keeps packages/domain-apple the single source of
 * truth while satisfying CNG (targets/ stays outside generated ios/).
 * The copied files are gitignored — never edit them directly.
 */
/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withDomainSync = (config) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      fs.rmSync(DEST, { recursive: true, force: true });
      fs.mkdirSync(DEST, { recursive: true });
      for (const file of fs.readdirSync(DOMAIN_SRC)) {
        if (file.endsWith(".swift")) {
          fs.copyFileSync(path.join(DOMAIN_SRC, file), path.join(DEST, file));
        }
      }
      return config;
    },
  ]);

module.exports = withDomainSync;
