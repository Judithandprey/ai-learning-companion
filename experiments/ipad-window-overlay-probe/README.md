# iPad 透明窗口实验

这是独立、短小的可行性实验，不是学习助手正式版。不接 AI，不采集屏幕、麦克风或相机，不使用私有 API。笔迹只在当前会话中；测试时不要写需要长期保存的内容。

## 两个 App

- **BackdropProbe**：底层独立进程。显示不断变化的计时器、点击计数与滚动标记。
- **GlassProbe**：上层透明 UIWindow + UIKit + PencilKit。提供笔、橡皮擦、撤销/重做和导航模式。

它们是两个不同 bundle ID 的原生 App。没有用同一 App 里的两层页面充当跨 App 成功；也没有用截图或屏幕视频冒充窗口透明。

## 先安装

优先使用独立安装，避免 Swift Playground 宿主影响窗口表现。发布包内的 `GlassProbe-unsigned.ipa` 与 `BackdropProbe-unsigned.ipa` 是用于重签的设备版本，不能直接点开安装。

Windows 上可使用第三方 **Sideloadly** 的免费 Apple ID 签名方式：

1. 只从 https://sideloadly.io/ 获取安装工具，并按官网要求安装 Apple 连接组件。
2. USB 连接 iPad，在设备上点“信任”。
3. 把一个 IPA 拖进 Sideloadly，选择连接的 iPad，使用 **Apple ID Sideload**。账号、密码、验证码由你本人在工具中输入，不发进聊天。
4. 在 iPad 按系统提示启用 Developer Mode（需要重启确认），并在“通用 → VPN 与设备管理”信任开发者；再安装第二个 IPA。
5. 免费签名通常 7 天到期，并受同时安装数量限制。首次实验无需开启常驻自动刷新。

这条安装路线来自工具的兼容说明；只有设备真正安装启动后才能记作安装成功。无需先购买 Mac 或开发者会员。

## 真机操作（按顺序）

1. iPad“设置 → 多任务与手势 → 窗口化 App”。
2. 打开 **BackdropProbe**。直接点按钮，确认“底层收到点击”增加；滚动一下，确认能看到不同标记。这是底层正控。
3. 打开 **GlassProbe**。先打开实色背景和手指绘画正控，验证工具条、笔迹、橡皮擦、Undo/Redo；然后关闭手指绘画，改用 Apple Pencil 验证，记录结果。
4. 将 GlassProbe 放在 BackdropProbe 上方。切成透明背景，观察**被 GlassProbe 窗口覆盖的区域**能否看到变化的底层计时器。看见旁边露出的区域不算通过。若只见黑/白底，如实记录。
5. 在 **NAV/导航** 模式，通过被覆盖的区域点击底层按钮、滚动底层内容。必须是 BackdropProbe 的计数增加或滚动标记移动，才说明它收到输入。
6. 切回 **WRITE/笔**，将“手指穿透候选”打开，先用 Pencil 写字、抬笔，再用手指点同一个被覆盖的底层按钮。分别记录 Pencil 能写与底层能点，不能把“手指不落墨”记作穿透成功。两者分别成功后再测同时接触；混合输入会保守路由到画布，不能据此断言系统不支持任何同步方案。
7. 按住 GlassProbe 窗口左上角控制按钮，选择 **Enter Slide Over / 进入侧拉**。再试点击底层、切换 Safari、拖动和调整窗口大小。记录是否仍在最上方、能覆盖多大。普通重叠与 Slide Over 分开记录。
8. 旋转 iPad，重复一次。用 GlassProbe 的 **Report/报告** 为已观察项目填 PASS/FAIL/NOT_TESTED，导出 JSON。没有测到的留 NOT_TESTED；不要一次勾满。

若全屏底层内容看不见或触摸不到，实验也有价值：保留该状态和操作步骤，定位限制，而不是继续堆功能。

## 判定边界

以下条件必须分别有真机证据：跨 App 实时可见、底层实际收到手指、Pencil 在上层写与擦、操作底层后上层仍可见、覆盖范围满足需要。

`backgroundColor = .clear`、`isOpaque = false`、`hitTest = nil` 都是待检验的设置，不是成功证据。PencilKit 的 `pencilOnly` 不等于手指会交给另一个 App。UIKit hit-testing 中未知或混合触摸会保守交给画布并单独记录；计数只是路由尝试，不代表系统完成跨进程转发。

报告不得通过编译/模拟器启动自动填写真机结果。两个 App 没有屏幕读取权限，不能自行确认下方 App 是否可见。真实窗口关系必须人工观察。

## 构建

在 macOS/Xcode 中打开 `WindowOverlayProbe.xcodeproj`，选择 GlassProbe 或 BackdropProbe scheme。两个目标只依赖系统 UIKit/PencilKit，无第三方包、App Group、广播扩展或付费服务。

`python3 make_project.py` 可重新生成项目与 Info.plist。

`bash ci/build.sh` 编译两种 SDK、打包设备 IPA、启动 iPad 模拟器保留截图。模拟器运行结果只用于检查启动和界面，不通过真实 Pencil、跨 App 透明、穿透或置顶验收。

CI 模板仅用于独立实验分支；不要替换主分支现有工作流。

## 来源

- Apple 窗口/Slide Over：https://support.apple.com/en-ie/125309
- UIWindowScene：https://developer.apple.com/documentation/uikit/uiwindowscene
- hitTest：https://developer.apple.com/documentation/uikit/uiview/hittest(_:with:)
- PencilKit：https://developer.apple.com/documentation/pencilkit/pkcanvasview
- Windows 侧载工具：https://sideloadly.io/
- Developer Mode：https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device
