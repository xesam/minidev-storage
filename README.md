# minidev-storage

微信 / 支付宝 / 抖音小程序通用的本地存储库。一套 API 在三端行为一致，并在原生存储之上提供命名空间、TTL 过期、键缺失默认值和类型化键表。

## 1. 包列表

按目标平台**安装一个平台包**即可，核心包会作为依赖自动安装。

| 包 | 用途 |
| --- | --- |
| [`@mini-dev/storage-wx`](packages/wx/README.md) | 微信小程序 |
| [`@mini-dev/storage-my`](packages/my/README.md) | 支付宝小程序 |
| [`@mini-dev/storage-tt`](packages/tt/README.md) | 抖音小程序 |
| [`@mini-dev/storage`](packages/core/README.md) | 核心包，平台包的依赖；接入其他宿主环境时直接使用 |

## 2. 快速上手

```bash
npm i @mini-dev/storage-wx
```

安装后在微信开发者工具中执行 **工具 → 构建 npm**。

```javascript
// pages/index/index.js（支付宝 / 抖音只需替换包名）
const { createStorage } = require('@mini-dev/storage-wx');

const userStore = createStorage({
    namespace: 'user',                    // 键前缀，物理键为 user/<key>
    defaultTtl: 7 * 24 * 3600 * 1000      // 默认 7 天过期（毫秒）
});

Page({
    async onLoad() {
        await userStore.set('profile', { name: 'A' });
        const profile = await userStore.get('profile');          // { name: 'A' }
        const theme = userStore.getSync('theme', 'light');       // 键不存在或已过期时返回 'light'
    }
});
```

## 3. 文档

- **[完整文档](packages/core/README.md)**：为什么用、安装、配置项、API 列表、键缺失时的返回值、三端差异的处理、与原生 API 互操作和迁移、类型化键表、已知边界。
- 平台特有说明（配额、错误码、注意点）：[微信](packages/wx/README.md)、[支付宝](packages/my/README.md)、[抖音](packages/tt/README.md)。

## 4. 示例工程

每个平台一个示例工程，可以直接用对应的开发者工具打开：[`sample-storage-wechat`](sample-storage-wechat)、[`sample-storage-alipay`](sample-storage-alipay)、[`sample-storage-douyin`](sample-storage-douyin)。

示例覆盖全部 12 个方法：实例创建与存储格式、命名空间隔离、异步与同步方法、TTL 过期、`clear` / `info` 的作用范围、与原生 API 混用。运行后可以在页面的输出面板中查看每一步的结果。

## 5. 参与开发

开发、构建和测试命令见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
