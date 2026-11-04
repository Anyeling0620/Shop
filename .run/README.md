# 一键启动运行配置

本目录是 IntelliJ IDEA 的**可共享运行配置**（`.run/*.run.xml`），随仓库走版本库，换目录 / 重新 clone 都不会丢。
IDEA 打开项目会自动识别，不需要手动导入。

## 怎么用

右侧 **Run** 面板（或右上角配置下拉）里选：

| 配置 | 说明 |
|---|---|
| `AllServices` | **完整一键启动**：Eureka + 全部 8 个业务/前端服务 |
| `AllServices (no eureka)` | 不启 Eureka 的版本（gateway 里 goods/user/search 是写死 IP，order/seckill 走 `lb://` 需要注册中心，所以日常建议用它时仍先起 Eureka） |
| 单个 `*App` | 单独调试某个服务 |

## 启动顺序（如需手动逐个起）

```
Eureka → gateway → goods/user → order/seckill → search → canal → web-app
```

端口：eureka 8761 / gateway 8081 / goods 18001 / order 18002 / search 18003 / web-app 18004 / canal 18005 / user 18006 / seckill 18007

## 为什么之前没有这些配置

- 根 `.gitignore` 忽略了整个 `.idea/`，原仓库的 `.idea/runConfigurations/` 里那份复合配置没有被提交
- IDEA 开启了 **external storage**（`misc.xml` 里 `ExternalStorageConfigurationManager enabled`），模块模型存在
  `%LOCALAPPDATA%\JetBrains\IntelliJIdea2026.2\projects\<项目名>.<hash>\external_build_system\`，
  按项目路径哈希存放，仓库一换目录就对不上，旧的运行配置也随之失效

## 注意

- 如果 IDEA 里不显示这些配置，确认 **Settings → Build Tools → Maven** 的 Maven home 指向
  `C:\APP\apache-maven-3.10.0`，并对根 `pom.xml` 执行一次 **Reload**。
- 运行配置里 `<method><option name="Make" enabled="true"/></method>` 表示启动前先编译该模块，
  依赖模块由 Maven 导入时已关联，无需额外设置。
