import { createStorageInstance } from '@mini-dev/storage';
import type { CreateStorageOptions, StorageInstance, StorageNative, StorageSchema } from '@mini-dev/storage';

// tt = 抖音小程序全局；本包仅在抖音环境使用，不防御其缺席（平台全局缺席属 misuse）。
declare const tt: any;

/**
 * 构造 tt 原生方法族绑定。懒绑语义由核心保证：本函数只在首次存储操作时被调用，
 * 模块加载（含默认单例的模块级创建）不触碰 tt，import 不抛。
 */
export function createTtNative(): StorageNative {
    return {
        setStorage: (options) => tt.setStorage(options),
        setStorageSync: (key, data) => tt.setStorageSync(key, data),
        getStorage: (options) => tt.getStorage(options),
        getStorageSync: (key) => tt.getStorageSync(key),
        removeStorage: (options) => tt.removeStorage(options),
        removeStorageSync: (key) => tt.removeStorageSync(key),
        clearStorage: (options) => tt.clearStorage(options),
        clearStorageSync: () => tt.clearStorageSync(),
        getStorageInfo: (options) => tt.getStorageInfo(options),
        getStorageInfoSync: () => tt.getStorageInfoSync()
    };
}

/**
 * 工厂：绑定 tt 原生方法族后创建统一 API 实例。
 * 配置创建时一次给定、创建后冻结。
 * 统一 API 下无键缺失端分派参数——tt 的键缺失形状（官方明文空串 / 帮助中心
 * fail 文案带 key 后缀）在核心读路径归一，文案差异不再进入调用方视野。
 */
export function createStorage<Schema extends object = StorageSchema>(options: CreateStorageOptions<Schema> = {}): StorageInstance<Schema> {
    return createStorageInstance<Schema>({ native: createTtNative }, options);
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
