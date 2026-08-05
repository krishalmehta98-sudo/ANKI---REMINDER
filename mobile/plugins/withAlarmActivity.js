const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Full-screen alarms need MainActivity to be allowed to wake and show over
 * the lock screen. Expo's app.json can't express these attributes, so we
 * patch AndroidManifest.xml during prebuild.
 */
module.exports = function withAlarmActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const activities = app.activity || [];
    const main = activities.find(
      (a) => a && a.$ && a.$['android:name'] === '.MainActivity'
    );
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
      main.$['android:launchMode'] = 'singleTask';
      main.$['android:excludeFromRecents'] = 'false';
    }
    return cfg;
  });
};
