package expo.modules.dynamicappicon

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

class DynamicAppIconModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DynamicAppIcon")

    AsyncFunction("setAppIcon") { iconName: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val packageManager = context.packageManager
      val packageName = context.packageName

      val mainActivity = "$packageName.MainActivity"
      val lightAlias = "$packageName.MainActivityLight"

      when (iconName) {
        "light" -> {
          packageManager.setComponentEnabledSetting(
            ComponentName(packageName, lightAlias),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
          packageManager.setComponentEnabledSetting(
            ComponentName(packageName, mainActivity),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
          )
        }
        "dark" -> {
          packageManager.setComponentEnabledSetting(
            ComponentName(packageName, mainActivity),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
          packageManager.setComponentEnabledSetting(
            ComponentName(packageName, lightAlias),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
          )
        }
        else -> throw IllegalArgumentException("Invalid icon name: $iconName. Must be 'light' or 'dark'.")
      }
    }
  }
}
