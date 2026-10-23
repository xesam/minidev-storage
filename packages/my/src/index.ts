import { createStorageInstance } from '@mini-dev/storage';
import type { CreateStorageOptions, StorageInstance, StorageNative, StorageSchema } from '@mini-dev/storage';

// my = 支付宝小程序全局；本包仅在支付宝环境使用，不防御其缺席（平台全局缺席属 misuse）。
declare const my: any;

/**
 * 构造 my 原生方法族绑定。懒绑语义由核心保证：本函数只在首次存储操作时被调用，
 * 模块加载（含默认单例的模块级创建）不触碰 my，import 不抛。
 *
 * 同步族按官方对象契约绑定（opendocs 现行文档 + 支付宝 IDE 2026-11 实测）：
 * 入参为 { key, data } 对象，返回 { data } / { success, error?, errorMessage? } 包装；
 * 位置参数形式在当前 IDE 已失效（写入不落盘、读取恒为 { data: undefined, success: true }）。
 * 绑定内解包 res.data、错误形状（Android success:false / IDE、iOS 裸 error）原样抛出；
 * 键缺失（data 为 null）经解包进入核心归一层，与异步 success + data null 同语义。
 */
export function createMyNative(): StorageNative {
    /** 同步族官方契约下错误经返回值传达（非 throw），真错误原样抛、不吞不包装。 */
    const rejectSyncError = (res: any): void => {
        if (res && (res.success === false || (res.error !== undefined && res.error !== null))) throw res;
    };
    return {
        setStorage: (options) => my.setStorage(options),
        setStorageSync: (key, data) => {
            const res = my.setStorageSync({ key, data });
            rejectSyncError(res);
        },
        getStorage: (options) => my.getStorage(options),
        getStorageSync: (key) => {
            const res = my.getStorageSync({ key });
            rejectSyncError(res);
            return res ? res.data : undefined;
        },
        removeStorage: (options) => my.removeStorage(options),
        removeStorageSync: (key) => {
            const res = my.removeStorageSync({ key });
            rejectSyncError(res);
        },
        clearStorage: (options) => my.clearStorage(options),
        clearStorageSync: () => my.clearStorageSync(),
        getStorageInfo: (options) => my.getStorageInfo(options),
        getStorageInfoSync: () => my.getStorageInfoSync()
    };
}

/**
 * 工厂：绑定 my 原生方法族后创建统一 API 实例。
 * 配置创建时一次给定、创建后冻结。
 * 统一 API 下无键缺失端分派参数——my 的特有 键缺失形状（异步走 success 且
 * data 为 null、同步经对象契约解包后同为 null）在核心读路径与 wx/tt 一并归一为键缺失。
 */
export function createStorage<Schema extends object = StorageSchema>(options: CreateStorageOptions<Schema> = {}): StorageInstance<Schema> {
    return createStorageInstance<Schema>({ native: createMyNative }, options);
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
