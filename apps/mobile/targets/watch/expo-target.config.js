/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: "watch",
  name: "SiestaWatch",
  displayName: "Siesta",
  bundleIdentifier: ".watch",
  deploymentTarget: "11.0",
  frameworks: ["HealthKit", "WatchKit"],
  entitlements: {
    "com.apple.developer.healthkit": true,
    "com.apple.developer.healthkit.access": [],
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [
        "group.app.siesta",
      ],
  },
});
