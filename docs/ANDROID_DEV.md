# Android 开发与 PC 调试

WHERE 使用 Tauri 2 复用 React 前端。Android 工程需要在本机准备：

1. Android Studio（包含 Android SDK、Platform Tools 和 Emulator）。
2. JDK 17 或更高版本，并设置 `JAVA_HOME`。
3. Android SDK 环境变量 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。
4. `adb` 位于 Android SDK 的 `platform-tools` 目录，并加入 PATH。

Windows PowerShell 示例：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
```

准备好环境后，在项目根目录执行：

```powershell
npm run tauri android init
npm run tauri android dev
```

`android init` 只需要首次执行。`android dev` 会启动前端开发服务器并尝试连接 Android 模拟器或 USB 调试设备。

检查设备：

```powershell
adb devices
```

如果要使用 Android Studio 模拟器，在 Device Manager 创建一个 API 级别较新的 x86_64 模拟器并启动；如果使用真机，需要开启开发者选项和 USB 调试。

当前仓库状态：Tauri Android CLI 已可用，但本机尚未安装 JDK，因此 Android 工程尚未生成。桌面端调试不受影响。
