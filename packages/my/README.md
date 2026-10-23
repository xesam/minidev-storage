# @mini-dev/storage-my

[`@mini-dev/storage`](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme) 的**支付宝小程序平台包**。本页只包含安装和支付宝特有的说明，API、配置项、TTL、类型化键表等完整文档见 [核心包文档](https://github.com/xesam/minidev-storage/tree/main/packages/core#readme)。

## 1. 安装

```bash
npm i @mini-dev/storage-my
```

- 按支付宝小程序 IDE 的 npm 构建流程构建。
- 支付宝的 npm 构建支持 ESM 转译，可以使用 `import` 引入，也可以使用 `require`。
- 本包只调用 `my` 全局对象，不检测运行平台。
- 示例工程：[`sample-storage-alipay`](https://github.com/xesam/minidev-storage/tree/main/sample-storage-alipay)，可以直接用支付宝小程序 IDE 打开。

## 2. 最小示例

```javascript
import { createStorage } from '@mini-dev/storage-my';

const userStore = createStorage({ namespace: 'user', defaultTtl: 7 * 24 * 3600 * 1000 });

Page({
    async onLoad() {
        await userStore.set('profile', { name: 'A' });
        const profile = await userStore.get('profile');          // { name: 'A' }
        const theme = userStore.getSync('theme', 'light');       // 键不存在时返回 'light'
    }
});
```

## 3. 支付宝原生差异的处理

- 异步读取不存在的键：原生**不走** `fail` 回调，而是走 `success` 且 `data` 为 `null`（官方文档 Bugs & Tips 中有说明），本库视为键缺失。
- 同步读取不存在的键：原生返回 `{ data: null }`（对象形式，无 `success` 字段；支付宝 IDE 2026-11 实测），本库解包后视为键缺失。
- 键缺失时的返回值规则见核心包文档「[键缺失时的返回值](https://github.com/xesam/minidev-storage/tree/main/packages/core#6-键缺失时的返回值)」。处理后，同一份代码在微信、支付宝、抖音上行为一致。

## 4. 支付宝配额与错误码

- 单个键最大 **200KB**，全部数据上限 **10MB**。单键上限只有微信的五分之一，本库的包装对象和命名空间前缀会占用少量空间，存储接近上限的大对象时需要留意。
- 原生错误码：`2` 必填参数为空，`12` 总量达到上限（10MB），`14` 数据长度超限（200KB）。错误对象（`{ error, errorMessage }`）原样抛出，本库不做包装。

## 5. 本端注意点

- 本库写入的数据是信封对象。用原生 `my.getStorageSync({ key })` 直接读取时，返回值是支付宝的 `{ data, success }` 包装，`res.data` 才是信封对象而非原值。格式见核心包文档「[物理存储格式与原生 API 互操作](https://github.com/xesam/minidev-storage/tree/main/packages/core#9-物理存储格式与原生-api-互操作)」。
- 支付宝同步存储 API 为对象参数形式：`my.setStorageSync({ key, data })`、`my.getStorageSync({ key })`（返回 `{ data }` 包装）、`my.removeStorageSync({ key })`，错误经返回值传达（Android 形状含 `success: false`，IDE / iOS 直接返回 `error` / `errorMessage`）。位置参数形式未被现行官方文档收录，且在支付宝 IDE（2026-11 实测）已失效：写入不落盘、读取恒为 `{ data: undefined, success: true }`。本库按官方对象契约绑定并解包返回值、错误对象原样抛出，调用方只使用本库的统一签名，不直接接触原生形状。

## License

MIT
