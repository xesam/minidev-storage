# 参与开发

## 1. 仓库结构

本仓库是 pnpm workspace monorepo，包含 4 个发布包和 3 个示例工程：

| 目录 | 包 | 说明 |
| --- | --- | --- |
| `packages/core` | `@mini-dev/storage` | 平台无关的核心实现，零运行时依赖 |
| `packages/wx` | `@mini-dev/storage-wx` | 绑定 `wx` 全局对象 |
| `packages/my` | `@mini-dev/storage-my` | 绑定 `my` 全局对象 |
| `packages/tt` | `@mini-dev/storage-tt` | 绑定 `tt` 全局对象 |
| `sample-storage-{wechat,alipay,douyin}` | — | 各平台的示例工程 |

内部结构见核心包文档「[自定义平台绑定](packages/core/README.md#12-自定义平台绑定)」。

## 2. 常用命令

请使用 pnpm，不要使用 npm（`workspace:*` 依赖只有 `pnpm publish` 会改写为实际版本号）。在仓库根目录执行：

```bash
pnpm install
pnpm run build        # 按依赖顺序构建：先核心包，再平台包（每个包 rimraf dist && tsdown）
pnpm test             # 构建后执行各包的 jest --coverage（覆盖率阈值 100%）
pnpm run typecheck    # 先构建核心包类型，再执行各包的 tsc --noEmit
pnpm verify-samples   # 用模拟的平台全局对象运行三端示例，检验构建产物
```

## 3. 单独运行测试

```bash
cd packages/core && npx jest test/instance.test.ts
```

平台包的测试依赖核心包的构建产物，单独运行前需要先构建核心包：

```bash
pnpm --filter @mini-dev/storage build
cd packages/wx && npx jest
```

## 4. 构建约定

- 每个包用 tsdown 输出 `dist/cjs` 和 `dist/esm`，两种格式各自带 `.d.ts`。
- tsdown 配置中显式设置 `target: 'es2015'`。
- `miniprogram` 字段指向 `dist/cjs/index.js`，供小程序「构建 npm」使用。
- 生产代码不使用 Node 全局对象（共享 tsconfig 中设置了 `types: []`）。
