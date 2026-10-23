# @mini-dev/storage-tt

[`@mini-dev/storage`](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme) 的**抖音小程序平台包**。本页只包含安装和抖音特有的说明，API、配置项、TTL、类型化键表等完整文档见 [核心包文档](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme)。

## 1. 安装

```bash
npm i @mini-dev/storage-tt
```

- 按抖音开发者工具的 npm 构建流程构建。
- 使用 `require` 引入（CommonJS）。
- 本包只调用 `tt` 全局对象，不检测运行平台。
- 示例工程：[`sample-storage-douyin`](https://github.com/xesam/minidev-storage/tree/main/sample-storage-douyin)，可以直接用抖音开发者工具打开。

## 2. 最小示例

```javascript
const { createStorage } = require('@mini-dev/storage-tt');

const userStore = createStorage({ namespace: 'user', defaultTtl: 7 * 24 * 3600 * 1000 });

Page({
    async onLoad() {
        await userStore.set('profile', { name: 'A' });
        const profile = await userStore.get('profile');          // { name: 'A' }
        const theme = userStore.getSync('theme', 'light');       // 键不存在时返回 'light'
    }
});
```

## 3. 抖音原生差异的处理

- 异步读取不存在的键：官方两处口径不一致——帮助中心示例走 `fail` 回调（`getStorage:fail data not found, key == no-exist-key`），现行 API 文档正文为 `success` 且 `data` 为空字符串（2026-11 复核）；两种形状本库都归一为键缺失，不返回错误信息。
- 同步读取不存在的键：原生返回空字符串 `''`（抖音 IDE 2026-11 实测；官方现行文档未载明，其错误表另列 `data not found, key == %s` 报错口径，与 IDE 实测不符），本库视为键缺失。
- 键缺失时的返回值规则见核心包文档「[键缺失时的返回值](https://github.com/xesam/minidev-storage/tree/main/packages/core#6-键缺失时的返回值)」。处理后，同一份代码在微信、支付宝、抖音上行为一致。

## 4. 抖音配额

- 单个键最大 **1MB**，全部数据上限 **10MB**。
- 官方说明的缓存清除时机只有三种：用户在抖音 / 头条内退出登录、用户在系统中清除 App 缓存、小程序长时间未使用触发清理。清除后读取会返回键缺失，按默认值规则处理。
- 超出配额时，`set` / `setSync` 原样抛出原生错误。

## 5. 本端注意点

- 本库写入的数据是包装对象，用 `tt.getStorageSync` 直接读取会得到包装对象而不是原值。格式见核心包文档「[物理存储格式与原生 API 互操作](https://github.com/xesam/minidev-storage/tree/main/packages/core#9-物理存储格式与原生-api-互操作)」。

## License

MIT
