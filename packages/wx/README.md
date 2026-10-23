# @mini-dev/storage-wx

[`@mini-dev/storage`](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme) 的**微信小程序平台包**。本页只包含安装和微信特有的说明，API、配置项、TTL、类型化键表等完整文档见 [核心包文档](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme)。

## 1. 安装

```bash
npm i @mini-dev/storage-wx
```

- 安装后在微信开发者工具中执行 **工具 → 构建 npm**，本包和依赖的 `@mini-dev/storage` 会一起构建到 `miniprogram_npm`。
- 使用 `require` 引入（CommonJS）。
- 本包只调用 `wx` 全局对象，不检测运行平台。
- 示例工程：[`sample-storage-wechat`](https://github.com/xesam/minidev-storage/tree/main/sample-storage-wechat)，可以直接用微信开发者工具打开。

## 2. 最小示例

```javascript
const { createStorage } = require('@mini-dev/storage-wx');

const userStore = createStorage({ namespace: 'user', defaultTtl: 7 * 24 * 3600 * 1000 });

Page({
    async onLoad() {
        await userStore.set('profile', { name: 'A' });
        const profile = await userStore.get('profile');          // { name: 'A' }
        const theme = userStore.getSync('theme', 'light');       // 键不存在时返回 'light'
    }
});
```

## 3. 微信原生差异的处理

- 异步读取不存在的键：原生走 `fail` 回调（`errMsg: 'getStorage:fail data not found'`；运行时行为，官方文档未载明——2026-11 复核），本库视为键缺失。
- 同步读取不存在的键：原生返回空字符串 `''`（运行时行为，官方文档未载明——2026-11 复核），本库视为键缺失。
- 键缺失时的返回值规则见核心包文档「[键缺失时的返回值](https://github.com/xesam/minidev-storage/tree/main/packages/core#6-键缺失时的返回值)」。处理后，同一份代码在微信、支付宝、抖音上行为一致。

## 4. 微信配额

- 单个键最大 **1MB**，全部数据上限 **10MB**。`info()` 返回的 `currentSize` / `limitSize` 单位为 KB。
- 可存储的数据类型（官方说明）：原生类型、`Date`，以及能被 `JSON.stringify` 序列化的对象。
- 超出配额时，`set` / `setSync` 原样抛出原生错误。

## 5. 本端注意点

- **`encrypt` 不可用**：本库不透传原生参数。微信的加密存储只在异步 `wx.setStorage` 上支持（基础库 2.21.3 起，AES-128），读取加密数据时 `getStorage` 也必须声明 `encrypt: true`。本库写入和读取都不支持这个参数，因此**无法读写加密的键**。需要加密的键请全部使用原生 API，不要和本库混用同一个键。另外，开启加密后数据体积约增加到 1.4 倍，单个键上限降为 0.7MB，总量上限降为 7.1MB。
- 本库写入的数据是包装对象，用 `wx.getStorageSync` 直接读取会得到包装对象而不是原值。格式见核心包文档「[物理存储格式与原生 API 互操作](https://github.com/xesam/minidev-storage/tree/main/packages/core#9-物理存储格式与原生-api-互操作)」。
- 微信还提供 `batchGetStorage` 系列方法和缓存管理器 `CacheManager`，本库目前没有封装。

## License

MIT
