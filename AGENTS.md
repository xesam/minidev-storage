# AGENTS.md

This file provides guidance to Code Agent (claude.ai/code) when working in this repository.

## What is this

`@mini-dev/storage` —— 跨微信 / 支付宝 / 抖音小程序的**本地存储统一封装库**（统一 API 族）。设计取向：存储 API 的三端差异（同步键缺失 `''` vs `null`、异步键缺失 fail vs success+null、tt 文案 key 后缀、配额）远大于一般原生 API 族，「增强不归一」的透传形态实测成本不可行——本库提供**自有契约的统一 API**（12 方法短名族），端差异在管线内归一，不进入调用方视野。

- **统一 API**：`set / get / remove / clear / info / has` × 裸名异步（Promise）/ `*Sync` 同步直返；异步族无回调模式（无 success/fail/complete），`get` 命中返回原值本身（非 `{ data }` 包装）、`set` 成功 `Promise<void>`；`get`/`getSync` 提供调用级 `defaultValue` 时返回类型重载收窄为 `Schema[K]`。
- **键缺失三级合成**：调用级 `defaultValue` > 实例级 `keyMissing(key)` 函数（可抛错）> `undefined`。
- **端差异归一层**：同步 `''`（wx/tt）/ `null`（my）、异步 fail / success+null 一律归一为键缺失；`get` 的异步 fail 一律按键缺失（读取无配额类错误）。库外裸写 `''` / `null` 与未命中在原生即不可区分，库沿用此语义（文档明示）。
- **错误原样透传**：不包装、不解释（无 `StorageError`）；配额类错误（超限）只出现在 set 路径，`set` / `remove` / `clear` / `info` 的原生 fail 均为真错误，原样 reject / throw。
- **实例工厂**：`createStorage({ namespace, defaultTtl, recordAt, keyMissing })` 配置创建时一次给定、创建后冻结。
- **物理层**：信封对象 `{ _v, _at?, _exp?, _val }`（序列化归原生）+ 双键即拆判定 + 库外互操作三方向 + `/` 分隔符。TTL 逐出直连物理键（防双前缀）。固定管线，不提供自定义拦截器。
- **泛型键表**：`createStorage<Schema>()`（约束 `Schema extends object`，业务 interface 无需 index signature），键名与值类型受检；缺省 `unknown`。

本仓库是 **pnpm workspace monorepo**，拆 4 个发布包：

- `packages/core` —— `@mini-dev/storage`：平台无关引擎（`createStorageInstance` / 信封 / 固定管线 / 类型）。**零运行时依赖**。不碰 `globalThis`。
- `packages/wx` —— `@mini-dev/storage-wx`：wx 原生方法族绑定（`createWxNative`）+ `createStorage` 工厂 + 零配置单例 `storage`。
- `packages/my` —— `@mini-dev/storage-my`：my 绑定（`createMyNative`）+ 同上。
- `packages/tt` —— `@mini-dev/storage-tt`：tt 绑定（`createTtNative`）+ 同上。

**为什么拆**：部分小程序「构建 npm」不解析 `exports` 子路径，`require('@mini-dev/storage/wx')` 在这些平台失败。拆成独立单入口包（仅 `main`）后任何「构建 npm」都能解析；消费方只安装一个平台包，核心经平台包 `dependencies` 传递引入。

## Commands

- **测试：** `pnpm test` = 拓扑序构建后各包 `jest --coverage`。每包核心 100% 覆盖（statements/branches/functions/lines），覆盖率阈值固定为 100，低于则失败。平台包测试依赖核心已构建（`pnpm test` 会先 `pnpm -r build`）。
- **类型检查：** `pnpm run typecheck`（先 `pnpm --filter @mini-dev/storage run build` 产出核心 dist，再各包 `tsc --noEmit`）。平台包 tsconfig 无 `paths`，`@mini-dev/storage` 经 node_modules 软链解析到核心**已构建的 dist 类型**——故必须先构建核心。
- **构建：** `pnpm run build`（按拓扑序先核心后平台包；每包 `rimraf dist && tsdown` → `dist/cjs` + `dist/esm`，双格式 + per-format `.d.ts`，显式 `target: es2015`）。配置见各包 `tsdown.config.ts`；小程序「构建 npm」落点为各包 `package.json` 的 `miniprogram: "dist/cjs/index.js"`。
- **单测单个文件：** 在某包目录下按文件名单跑（如核心包 `npx jest test/instance.test.ts`；平台包需先 `pnpm --filter @mini-dev/storage build` 产出核心 dist）。
- **冒烟：** `pnpm verify-samples`（先 build，再用 mock 原生全局把 wechat/alipay/douyin 三套示例各驱动一遍真实构建产物：12 方法统一契约、TTL 驱逐、键缺失三级合成、实例域 clear/info、物理信封）。

## Architecture

```
平台包 createStorage<Schema>(options) ── 直接引用本平台全局 wx/my/tt（懒绑工厂 createXxxNative）
   │
   └─► 核心 createStorageInstance<Schema>(binder, options) ── 统一 API 实例（12 方法）
          ├─ 写路径：physicalKey 前缀 → packEnvelope（信封对象）→ 原生 set(Storage/Sync)
          ├─ 读路径：原生 get(Storage/Sync) → 键缺失归一（'' / null / undefined / fail）
          │    → unpackEnvelope（双键即拆）→ isExpired → 过期逐出（直连物理键）→ 键缺失三级合成
          ├─ 实例域 clear：无前缀透传原生全域；有前缀枚举 keys + 逐个 remove（遇错即抛、不回滚；clear() 全程走异步原生族 getStorageInfo+removeStorage，clearSync() 走同步族）
          └─ info：keys 过滤去前缀；currentSize / limitSize 全域值透传
```

- **binder 极简**（统一 API 的直接收益）：`StorageBinder` 只剩 `native: () => StorageNative`——透传形态的 `asyncMissStyle` / `missFailMessage` / `syncMissReturn` 三个端分派参数全部退役，端差异改为核心读路径的统一归一逻辑，平台包只剩「绑定原生方法族」一件事。
- **my 同步族绑定含契约适配**：支付宝同步 API 现行官方文档为对象参数形式——`my.xxxSync({ key, data })`、返回 `{ data }` / `{ success, error?, errorMessage? }` 包装；位置参数形式未被官方文档收录且在支付宝 IDE 2026-11 实测已失效（写入不落盘、读取恒为 `{ data: undefined, success: true }`）。`createMyNative` 内做签名适配：解包 `res.data`、错误形状（Android `success: false` / IDE、iOS 裸 `error`）原样抛出；`StorageNative` 与核心契约不变，端差异不进入核心。
- **懒绑**：`createXxxNative` 只在首次存储操作时被调用；模块加载（含默认单例创建）不触碰平台全局，import 不抛。平台全局缺席属 misuse，首次调用即抛、不做防御处理。
- **读路径 fail 归一**：`getStorage` 的异步 fail 一律按键缺失处理（读取无配额类错误，fail 实际语义就是键缺失）；`set` / `remove` / `clear` / `info` 的 fail 是真错误，原样 reject / throw。

## Conventions

- **仓库自包含**：`@mini-dev-core` 是父级工作目录，本仓库任何文件（源码注释 / 文档 / 示例 / 脚本）禁止引用其中的内容（RFC 决策记录、其他子项目等）。决策依据若重要，直接写进本仓库文档，不留外部指针。
- 公开 API 收敛在 `packages/core/src/index.ts`：导出 `createStorageInstance` + 公开类型（`ENVELOPE_VERSION` 为内部常量，不对外导出）。**不导出** `packEnvelope` / `unpackEnvelope` / `isExpired` 与任何平台绑定。内部实现测试直接从 `packages/core/src/...` 路径导入。`packages/core/test/index.test.ts` 有导出面断言（`Object.keys` 只含一项），收敛后要同步；各平台包测试只断言功能、不锁导出面。
- 4 空格缩进、单引号、分号。无 prettier 依赖。
- 加新读路径归一规则：改 `instance.ts` 的 `isSyncKeyMissingMarker` / `settleAsync`，同步 `packages/core/test/instance.test.ts` 并保持 100% 覆盖。
- 加新平台包：新建 `packages/<plat>/`（`src/index.ts` + `package.json`/`tsconfig.json`/`tsdown.config.ts`/`jest.config.js` + `test/`），在 `pnpm-workspace.yaml` 的 `packages/*` 通配下自动纳入；新增对应 sample + 在 `scripts/verify-samples.cjs` 的 `SAMPLES` 注册。
- 示例 `sample-storage-*` 的 `package.json` 必须直接依赖**两件**：对应平台包（`workspace:*`）+ `@mini-dev/storage`（`workspace:*`）。原因：微信「构建 npm」只处理示例顶层 `node_modules` 里的包，不钻进 pnpm 嵌套 `node_modules` 找传递依赖。`pnpm verify-samples` 里的 `checkSampleDeps` 是防回归 guard。示例 tap 与 `verify-samples.cjs` 的 `TAP_ASSERTS`（12 条）一一对应；断言只面对当前 tap 输出（`resetLog`），但 mock 存储 map 跨 tap 保留——断言正则需吸收历史键（如 `\[\S*shared\]`）。
- 跨包类型解析：**根 `tsconfig.json`** 用 `paths` 把 `@mini-dev/storage` 映射到 `packages/core/src`（IDE 跨包导航用，不参与脚本化构建）。各包 `tsconfig.json` **无 `paths`**，`tsc`/tsdown/jest 一律经 node_modules 软链解析到核心**已构建的 dist**——故 `pnpm test`/`typecheck`/平台包 build 需先构建核心，拓扑序由 pnpm `-r` 保证。
- `workspace:*` 协议在发布时由 pnpm 改写为实际版本；各包 tsdown cjs pass 的 `onSuccess`（`scripts/build-deps.cjs` 的 `resolveDeps`）把 `workspace:*` 解析为已安装实际版本的 caret 区间写入 `dist/cjs/package.json`，让小程序「构建 npm」运行时跨包 require 可用。
- 已知能力损失（文档承诺过、有意为之）：wx `setStorage` 的 `encrypt` 参数在统一 API 下不可用（库不透传原生参数）；需要 encrypt 的键整段用原生读写（wx 官方要求写读两侧同时声明 `encrypt: true`，库无法代读加密键）。v2 若引入平台参数透传位再评估（边界承诺处：`packages/core/README.md`「已知边界」节 + `packages/wx/README.md`「本端注意点」）。
