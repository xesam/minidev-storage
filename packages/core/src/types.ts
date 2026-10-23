/**
 * 统一 API 层类型（统一封装族）。
 *
 * 设计基线：
 * - 12 方法全双版：裸名 = 异步（Promise）、`*Sync` = 同步直返；
 * - 方法名短名族 set/get/remove/clear/info/has，不复刻原生 `*Storage` 形状；
 * - 键缺失三级合成：调用级 defaultValue > 实例级 keyMissing(key) 函数 > undefined；
 * - 错误原样透传（不包装、不解释），get 族读取路径的 fail / 空串 / null 归一为键缺失；
 * - TS 泛型键表：createStorage<Schema>() 后键名与值类型受检。
 */

/** 泛型键表：键 → 值类型 */
export type StorageSchema = Record<string, unknown>;

// ---------- 原生绑定层（物理层，与原生存储族一一对应） ----------

export interface NativeCallbacks {
    success?: (res: any) => void;
    fail?: (err: any) => void;
    complete?: () => void;
}

export interface SetStorageNativeOptions extends NativeCallbacks {
    key: string;
    data: unknown;
    [key: string]: unknown;
}

export interface GetStorageNativeOptions extends NativeCallbacks {
    key: string;
    [key: string]: unknown;
}

export interface RemoveStorageNativeOptions extends NativeCallbacks {
    key: string;
    [key: string]: unknown;
}

export interface ClearStorageNativeOptions extends NativeCallbacks {
    [key: string]: unknown;
}

export interface StorageInfoNativeOptions extends NativeCallbacks {
    [key: string]: unknown;
}

export interface StorageInfoNativeResult {
    keys: string[];
    currentSize: number;
    limitSize: number;
    [key: string]: unknown;
}

/**
 * 平台原生方法族。由平台包绑定 wx / my / tt 全局后提供；
 * 核心经 StorageBinder 拿到它，不自己触碰任何平台全局。
 */
export interface StorageNative {
    setStorage(options: SetStorageNativeOptions): void;
    setStorageSync(key: string, data: unknown): void;
    getStorage(options: GetStorageNativeOptions): void;
    getStorageSync(key: string): unknown;
    removeStorage(options: RemoveStorageNativeOptions): void;
    removeStorageSync(key: string): void;
    clearStorage(options: ClearStorageNativeOptions): void;
    clearStorageSync(): void;
    getStorageInfo(options: StorageInfoNativeOptions): void;
    getStorageInfoSync(): StorageInfoNativeResult;
}

// ---------- 平台绑定物（core 与平台包的接缝） ----------

/**
 * 统一 API 下 binder 只剩原生方法族懒绑工厂——
 * 键缺失 / 文案 / 返回值的端分派参数全部退役（返回值契约由库定义，
 * 不复刻三端原生形状）。端差异（同步键缺失返回 '' 或 null、异步键缺失走
 * fail 或 success+null）在核心读路径内统一归一为键缺失。
 */
export interface StorageBinder {
    /** 原生方法族懒绑工厂：import 不抛、首次调用时绑定平台全局 */
    native: () => StorageNative;
}

// ---------- 工厂配置（创建时一次给定，创建后冻结） ----------

export interface CreateStorageOptions<Schema extends object = StorageSchema> {
    /** 命名空间（键前缀）。缺省无前缀 */
    namespace?: string;
    /** 实例级默认 TTL（ms），> 0 生效；缺省 = 永不过期 */
    defaultTtl?: number;
    /** 信封随 _at 写入时间。缺省不写 */
    recordAt?: boolean;
    /**
     * 实例级 keyMissing 行为函数：get / getSync 未命中时调用，
     * 返回值作为合成结果（应返回与该键匹配的类型）或直接抛错。
     * 优先级低于调用级 defaultValue。
     */
    keyMissing?: (key: keyof Schema & string) => unknown;
}

// ---------- 方法选项与结果（库自有契约，非原生形状） ----------

/** set / setSync 的键级控制容器 */
export interface SetOptions {
    /** 本键 TTL（ms）。0 = 永不过期（覆盖实例默认）；缺省 = 继承 defaultTtl */
    ttl?: number;
}

/** info / infoSync 结果：keys 为去前缀的本实例域逻辑键，大小字段为全域值 */
export interface StorageInfo {
    keys: string[];
    /** 全域当前用量（KB）——原生不提供逐键大小 */
    currentSize: number;
    /** 全域容量上限（KB） */
    limitSize: number;
}

/** 统一 API 实例：六概念 × 异步 / 同步 */
export interface StorageInstance<Schema extends object = StorageSchema> {
    /** 异步写。仅 reject 原生错误（写入超限等），无成功载荷 */
    set<K extends keyof Schema & string>(key: K, data: Schema[K], options?: SetOptions): Promise<void>;
    /** 同步写。原生错误直接 throw */
    setSync<K extends keyof Schema & string>(key: K, data: Schema[K], options?: SetOptions): void;
    /**
     * 异步读。命中返回原值；未命中走三级合成（defaultValue > keyMissing(key) > undefined）。
     * 类型收窄：提供调用级 defaultValue（类型不含 undefined）时返回 Schema[K]，不再含
     * undefined，调用方无需判空；不提供（或传入值可能为 undefined）时为 Schema[K] | undefined。
     */
    get<K extends keyof Schema & string>(key: K): Promise<Schema[K] | undefined>;
    get<K extends keyof Schema & string>(key: K, defaultValue: Schema[K]): Promise<Schema[K]>;
    get<K extends keyof Schema & string>(key: K, defaultValue?: Schema[K]): Promise<Schema[K] | undefined>;
    /** 同步读。命中直返原值；未命中走三级合成（类型收窄规则同 get） */
    getSync<K extends keyof Schema & string>(key: K): Schema[K] | undefined;
    getSync<K extends keyof Schema & string>(key: K, defaultValue: Schema[K]): Schema[K];
    getSync<K extends keyof Schema & string>(key: K, defaultValue?: Schema[K]): Schema[K] | undefined;
    /** 异步移除。键不存在不算错误 */
    remove<K extends keyof Schema & string>(key: K): Promise<void>;
    /** 同步移除 */
    removeSync<K extends keyof Schema & string>(key: K): void;
    /** 异步清空本实例域（无前缀实例 = 原生全域）。批量删除遇错即 reject、已删除不回滚 */
    clear(): Promise<void>;
    /** 同步清空本实例域。遇错即 throw、不回滚 */
    clearSync(): void;
    /** 异步实例域统计 */
    info(): Promise<StorageInfo>;
    /** 同步实例域统计 */
    infoSync(): StorageInfo;
    /** 异步命中判定（信封 + 过期均在管线内） */
    has<K extends keyof Schema & string>(key: K): Promise<boolean>;
    /** 同步命中判定 */
    hasSync<K extends keyof Schema & string>(key: K): boolean;
}
