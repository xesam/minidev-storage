import { createStorageInstance } from '@mini-dev/storage';
import type { CreateStorageOptions, StorageInstance, StorageNative, StorageSchema } from '@mini-dev/storage';

// wx = 微信小程序全局；本包仅在微信环境使用，不防御其缺席（平台全局缺席属 misuse）。
declare const wx: any;

/**
 * 构造 wx 原生方法族绑定。懒绑语义由核心保证：本函数只在首次存储操作时被调用，
 * 模块加载（含默认单例的模块级创建）不触碰 wx，import 不抛。
 */
export function createWxNative(): StorageNative {
    return {
        setStorage: (options) => wx.setStorage(options),
        setStorageSync: (key, data) => wx.setStorageSync(key, data),
        getStorage: (options) => wx.getStorage(options),
        getStorageSync: (key) => wx.getStorageSync(key),
        removeStorage: (options) => wx.removeStorage(options),
        removeStorageSync: (key) => wx.removeStorageSync(key),
        clearStorage: (options) => wx.clearStorage(options),
        clearStorageSync: () => wx.clearStorageSync(),
        getStorageInfo: (options) => wx.getStorageInfo(options),
        getStorageInfoSync: () => wx.getStorageInfoSync()
    };
}

/**
 * 工厂：绑定 wx 原生方法族后创建统一 API 实例。
 * 配置创建时一次给定、创建后冻结。
 * 统一 API 下无键缺失端分派参数——键缺失 / 文案 / 返回值契约由库定义（wx 的
 * 同步空串键缺失、异步 fail 键缺失在核心读路径归一），binder 只剩原生绑定。
 */
export function createStorage<Schema extends object = StorageSchema>(options: CreateStorageOptions<Schema> = {}): StorageInstance<Schema> {
    return createStorageInstance<Schema>({ native: createWxNative }, options);
}

/** 零配置默认单例：无前缀、无 TTL、无键缺失合成（get 未命中返回 undefined）。 */
export const storage = createStorage();

export { createStorageInstance };
export type {
    ClearStorageNativeOptions,
    CreateStorageOptions,
    GetStorageNativeOptions,
    NativeCallbacks,
    RemoveStorageNativeOptions,
    SetOptions,
    SetStorageNativeOptions,
    StorageBinder,
    StorageInfo,
    StorageInfoNativeOptions,
    StorageInfoNativeResult,
    StorageInstance,
    StorageNative,
    StorageSchema
} from '@mini-dev/storage';
