import { packEnvelope, unpackEnvelope, isExpired } from './envelope';
import type {
    CreateStorageOptions,
    SetOptions,
    StorageBinder,
    StorageInfo,
    StorageInfoNativeResult,
    StorageInstance,
    StorageNative,
    StorageSchema
} from './types';

/** 命名空间分隔符（与 @mini-dev 家族跨包键空间约定一致） */
const SEPARATOR = '/';

/**
 * 读路径键缺失归一（统一 API 的关键归一层）：
 *
 * - 同步：wx / tt 对不存在的键返回 `''`、my 返回 `null`——三端不一致；
 *   且原生存储本身无法区分「存过 ''/null」与「不存在」（原生缺陷）。
 *   库将 `''` / `null` / `undefined` 统一判定为键缺失，三端一致；
 * - 异步：getStorage 走 fail（wx / tt）或 success + data null（my），
 *   读取路径的 fail 一律归一为键缺失（get 无配额类错误，fail 的实际语义就是键缺失）。
 *   库外裸写 ''/null 的值因此读作键缺失——与原生行为一致，README 注明。
 */
function isSyncKeyMissingMarker(stored: unknown): boolean {
    return stored === '' || stored === null || stored === undefined;
}

export function createStorageInstance<Schema extends object = StorageSchema>(
    binder: StorageBinder,
    options: CreateStorageOptions<Schema> = {}
): StorageInstance<Schema> {
    const namespace = options.namespace || '';
    const defaultTtl = options.defaultTtl || 0;
    const recordAt = options.recordAt === true;
    const keyMissingHandler = options.keyMissing;
    const prefix = namespace ? namespace + SEPARATOR : '';

    let bound: StorageNative | null = null;
    const native = (): StorageNative => {
        if (!bound) bound = binder.native();
        return bound;
    };

    const physicalKey = (key: string): string => prefix + key;
    const isOwnKey = (key: string): boolean => key.indexOf(prefix) === 0;

    const resolveExpireAt = (ttl: number | undefined): number | undefined => {
        const effective = ttl === undefined ? defaultTtl : ttl;
        return effective > 0 ? Date.now() + effective : undefined;
    };

    /** 键缺失三级合成：调用级 defaultValue > 实例级 keyMissing(key) > undefined。keyMissing 函数可抛错。 */
    const resolveKeyMissing = (key: string, defaultValue: unknown): unknown => {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        if (keyMissingHandler) {
            return keyMissingHandler(key as keyof Schema & string);
        }
        return undefined;
    };

    /** 同步读判定。missing=true 表示「不存在 / 已过期逐出 / 归一空值」。 */
    const settleSync = (key: string): { missing: boolean; value: unknown } => {
        const physical = physicalKey(key);
        const stored = native().getStorageSync(physical);
        if (isSyncKeyMissingMarker(stored)) {
            return { missing: true, value: undefined };
        }
        const now = Date.now();
        const u = unpackEnvelope(stored);
        if (u.kind !== 'envelope') {
            return { missing: false, value: u.value };
        }
        if (isExpired(u.expireAt, now)) {
            try {
                // 直连物理键逐出，不复用带前缀的 remove（防双前缀）
                native().removeStorageSync(physical);
            } catch {
                // 逐出失败不改变键缺失语义
            }
            return { missing: true, value: undefined };
        }
        return { missing: false, value: u.value };
    };

    /** 异步读判定（Promise 化，内部经回调驱动原生）。fail 一律按键缺失归一。 */
    const settleAsync = (key: string): Promise<{ missing: boolean; value: unknown }> =>
        new Promise((resolve) => {
            native().getStorage({
                key: physicalKey(key),
                success: (rawRes) => {
                    const data = rawRes ? (rawRes as Record<string, unknown>).data : undefined;
                    if (isSyncKeyMissingMarker(data)) {
                        resolve({ missing: true, value: undefined });
                        return;
                    }
                    const now = Date.now();
                    const u = unpackEnvelope(data);
                    if (u.kind !== 'envelope') {
                        resolve({ missing: false, value: u.value });
                        return;
                    }
                    if (isExpired(u.expireAt, now)) {
                        try {
                            native().removeStorageSync(physicalKey(key));
                        } catch {
                            // 逐出失败不改变键缺失语义
                        }
                        resolve({ missing: true, value: undefined });
                        return;
                    }
                    resolve({ missing: false, value: u.value });
                },
                fail: () => resolve({ missing: true, value: undefined })
            });
        });

    // ===== set =====

    const set = <K extends keyof Schema & string>(key: K, data: Schema[K], options?: SetOptions): Promise<void> =>
        new Promise((resolve, reject) => {
            native().setStorage({
                key: physicalKey(key),
                data: packEnvelope(data, recordAt, resolveExpireAt(options ? options.ttl : undefined)),
                success: () => resolve(),
                fail: (err) => reject(err)
            });
        });

    const setSync = <K extends keyof Schema & string>(key: K, data: Schema[K], options?: SetOptions): void => {
        native().setStorageSync(
            physicalKey(key),
            packEnvelope(data, recordAt, resolveExpireAt(options ? options.ttl : undefined))
        );
    };

    // ===== get =====

    function get<K extends keyof Schema & string>(key: K): Promise<Schema[K] | undefined>;
    function get<K extends keyof Schema & string>(key: K, defaultValue: Schema[K]): Promise<Schema[K]>;
    function get<K extends keyof Schema & string>(key: K, defaultValue?: Schema[K]): Promise<Schema[K] | undefined> {
        return settleAsync(key).then((r) => (r.missing ? (resolveKeyMissing(key, defaultValue) as Schema[K] | undefined) : (r.value as Schema[K])));
    }

    function getSync<K extends keyof Schema & string>(key: K): Schema[K] | undefined;
    function getSync<K extends keyof Schema & string>(key: K, defaultValue: Schema[K]): Schema[K];
    function getSync<K extends keyof Schema & string>(key: K, defaultValue?: Schema[K]): Schema[K] | undefined {
        const r = settleSync(key);
        return (r.missing ? resolveKeyMissing(key, defaultValue) : r.value) as Schema[K] | undefined;
    }

    // ===== remove =====

    const remove = <K extends keyof Schema & string>(key: K): Promise<void> =>
        new Promise((resolve, reject) => {
            native().removeStorage({
                key: physicalKey(key),
                success: () => resolve(),
                fail: (err) => reject(err)
            });
        });

    const removeSync = <K extends keyof Schema & string>(key: K): void => {
        native().removeStorageSync(physicalKey(key));
    };

    // ===== clear =====

    /** 同步枚举删除本域物理键（clearSync 用）：getStorageInfoSync + 逐个 removeStorageSync，遇错即抛。 */
    const clearOwnKeys = (): void => {
        const raw = native().getStorageInfoSync();
        const keys = raw.keys || [];
        for (const k of keys) {
            if (isOwnKey(k)) {
                native().removeStorageSync(k);
            }
        }
    };

    /** 异步原生统计（info / clear 共用）。fail 为真错误，原样 reject。 */
    const nativeInfoAsync = (): Promise<StorageInfoNativeResult> =>
        new Promise((resolve, reject) => {
            native().getStorageInfo({
                success: (rawRes) => resolve(rawRes as StorageInfoNativeResult),
                fail: (err) => reject(err)
            });
        });

    /** 异步移除单个物理键（clear 逐键删除用）。fail 原样 reject。 */
    const removePhysicalAsync = (physical: string): Promise<void> =>
        new Promise((resolve, reject) => {
            native().removeStorage({ key: physical, success: () => resolve(), fail: (err) => reject(err) });
        });

    /**
     * 异步枚举删除本域物理键（clear 用）：全程走异步原生方法（getStorageInfo 枚举 +
     * 逐键 removeStorage），逐键删除经事件循环交错执行，不在调用点同步完成全部工作；
     * 顺序删除、遇错即 reject、已删除不回滚（与 clearSync 同语义）。
     */
    const clearOwnKeysAsync = (): Promise<void> =>
        nativeInfoAsync().then((raw) =>
            (raw.keys || []).filter(isOwnKey).reduce(
                (chain: Promise<void>, k: string) => chain.then(() => removePhysicalAsync(k)),
                Promise.resolve()
            )
        );

    const clear = (): Promise<void> => {
        if (!prefix) {
            // 无前缀：与原生全域语义重合，透传原生清空
            return new Promise((resolve, reject) => {
                native().clearStorage({ success: () => resolve(), fail: (err) => reject(err) });
            });
        }
        return clearOwnKeysAsync();
    };

    const clearSync = (): void => {
        if (!prefix) {
            native().clearStorageSync();
            return;
        }
        clearOwnKeys();
    };

    // ===== info =====

    const toOwnInfo = (raw: StorageInfoNativeResult): StorageInfo => ({
        keys: (raw.keys || []).filter(isOwnKey).map((k) => k.slice(prefix.length)),
        currentSize: raw.currentSize,
        limitSize: raw.limitSize
    });

    const info = (): Promise<StorageInfo> => nativeInfoAsync().then(toOwnInfo);

    const infoSync = (): StorageInfo => toOwnInfo(native().getStorageInfoSync());

    // ===== has =====

    const has = <K extends keyof Schema & string>(key: K): Promise<boolean> => settleAsync(key).then((r) => !r.missing);

    const hasSync = <K extends keyof Schema & string>(key: K): boolean => !settleSync(key).missing;

    return {
        set,
        setSync,
        get,
        getSync,
        remove,
        removeSync,
        clear,
        clearSync,
        info,
        infoSync,
        has,
        hasSync
    };
}
