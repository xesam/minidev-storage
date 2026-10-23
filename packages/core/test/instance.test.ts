import { createStorageInstance } from '../src/instance';
import type {
    CreateStorageOptions,
    StorageBinder,
    StorageInstance,
    StorageNative,
    StorageSchema,
    SetStorageNativeOptions
} from '../src/types';

// ---- 模拟原生：内存 Map + wx 形状的回调语义（key 不存在走 fail / 同步返回空串） ----

class MockNative implements StorageNative {
    map = new Map<string, unknown>();
    calls = { setStorage: 0, setStorageSync: 0, getStorage: 0, getStorageSync: 0, removeStorage: 0, removeStorageSync: 0, clearStorage: 0, clearStorageSync: 0, getStorageInfo: 0, getStorageInfoSync: 0 };
    failNextSet = false;
    failNextRemove = false;
    failNextInfo = false;
    failNextClear = false;
    bareSuccess = false;
    removeThrowsOn: string | null = null;
    failRemoveOn: string | null = null;
    omitKeys = false;

    setStorage(o: SetStorageNativeOptions): void {
        this.calls.setStorage++;
        if (this.failNextSet) {
            this.failNextSet = false;
            o.fail && o.fail({ errMsg: 'setStorage:fail exceed storage max size' });
            o.complete && o.complete();
            return;
        }
        this.map.set(o.key, o.data);
        o.success && o.success({ errMsg: 'setStorage:ok' });
        o.complete && o.complete();
    }

    setStorageSync(key: string, data: unknown): void {
        this.calls.setStorageSync++;
        this.map.set(key, data);
    }

    getStorage(o: { key: string; success?: (r: any) => void; fail?: (e: any) => void; complete?: () => void }): void {
        this.calls.getStorage++;
        if (!this.map.has(o.key)) {
            o.fail && o.fail({ errMsg: 'getStorage:fail data not found' });
            o.complete && o.complete();
            return;
        }
        // bareSuccess: 模拟原生 success 回调无载荷（防御分支）
        o.success && o.success(this.bareSuccess ? undefined : { data: this.map.get(o.key), errMsg: 'getStorage:ok' });
        o.complete && o.complete();
    }

    getStorageSync(key: string): unknown {
        this.calls.getStorageSync++;
        if (!this.map.has(key)) {
            return '';
        }
        return this.map.get(key);
    }

    removeStorage(o: { key: string; success?: (r: any) => void; fail?: (e: any) => void; complete?: () => void }): void {
        this.calls.removeStorage++;
        if (this.failRemoveOn === o.key) {
            this.failRemoveOn = null;
            o.fail && o.fail({ errMsg: 'removeStorage:fail mock' });
            o.complete && o.complete();
            return;
        }
        if (this.failNextRemove) {
            this.failNextRemove = false;
            o.fail && o.fail({ errMsg: 'removeStorage:fail mock' });
            o.complete && o.complete();
            return;
        }
        this.map.delete(o.key);
        o.success && o.success({ errMsg: 'removeStorage:ok' });
        o.complete && o.complete();
    }

    removeStorageSync(key: string): void {
        this.calls.removeStorageSync++;
        if (this.removeThrowsOn === key) {
            throw new Error('removeStorageSync:fail mock');
        }
        this.map.delete(key);
    }

    clearStorage(o: { success?: (r: any) => void; fail?: (e: any) => void; complete?: () => void }): void {
        this.calls.clearStorage++;
        if (this.failNextClear) {
            this.failNextClear = false;
            o.fail && o.fail({ errMsg: 'clearStorage:fail mock' });
            o.complete && o.complete();
            return;
        }
        this.map.clear();
        o.success && o.success({ errMsg: 'clearStorage:ok' });
        o.complete && o.complete();
    }

    clearStorageSync(): void {
        this.calls.clearStorageSync++;
        this.map.clear();
    }

    getStorageInfo(o: { success?: (r: any) => void; fail?: (e: any) => void; complete?: () => void }): void {
        this.calls.getStorageInfo++;
        if (this.failNextInfo) {
            this.failNextInfo = false;
            o.fail && o.fail({ errMsg: 'getStorageInfo:fail mock' });
            o.complete && o.complete();
            return;
        }
        o.success && o.success({ keys: this.omitKeys ? (undefined as unknown as string[]) : [...this.map.keys()], currentSize: 1, limitSize: 10, errMsg: 'getStorageInfo:ok' });
        o.complete && o.complete();
    }

    getStorageInfoSync(): { keys: string[]; currentSize: number; limitSize: number } {
        this.calls.getStorageInfoSync++;
        return {
            keys: this.omitKeys ? (undefined as unknown as string[]) : [...this.map.keys()],
            currentSize: 1,
            limitSize: 10
        };
    }
}

// ---- 构造工具 ----

function setup<S extends object = StorageSchema>(opts?: CreateStorageOptions<S>): { store: StorageInstance<S>; mock: MockNative } {
    const mock = new MockNative();
    const binder: StorageBinder = { native: () => mock };
    return { store: createStorageInstance<S>(binder, opts), mock };
}

function atTime(t: number): () => void {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(t);
    return () => spy.mockRestore();
}

function readEnvelope(raw: unknown): Record<string, unknown> {
    // 信封 Object 化后物理存储即对象，无需 parse
    return raw as Record<string, unknown>;
}

afterEach(() => {
    jest.restoreAllMocks();
});

// ===== set =====

describe('set 写入管线：前缀 + 信封 + TTL 继承', () => {
    it('setSync 打上命名空间前缀的信封', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('profile', { name: 'A' });
        expect(mock.map.has('user/profile')).toBe(true);
        expect(readEnvelope(mock.map.get('user/profile'))).toEqual({ _v: 1, _val: { name: 'A' } });
        // 同步写锚点：setSync 退化调异步 setStorage 时计数不匹配即红
        expect(mock.calls.setStorageSync).toBe(1);
        expect(mock.calls.setStorage).toBe(0);
    });

    it('无命名空间时物理键即原键', () => {
        const { store, mock } = setup();
        store.setSync('k', 1);
        expect(mock.map.has('k')).toBe(true);
        expect(readEnvelope(mock.map.get('k'))).toEqual({ _v: 1, _val: 1 });
    });

    it('defaultTtl 继承：信封带 _exp；recordAt 写 _at', () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 5000, recordAt: true });
        store.setSync('k', 'x');
        expect(readEnvelope(mock.map.get('k'))).toEqual({ _v: 1, _at: 1000, _exp: 6000, _val: 'x' });
        restore();
    });

    it('SetOptions.ttl 覆盖实例默认；ttl: 0 置零清除 _exp', () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 5000 });
        store.setSync('a', 1, { ttl: 100 });
        store.setSync('b', 2, { ttl: 0 });
        expect(readEnvelope(mock.map.get('a'))).toEqual({ _v: 1, _exp: 1100, _val: 1 });
        expect(readEnvelope(mock.map.get('b'))).toEqual({ _v: 1, _val: 2 });
        restore();
    });

    it('set（异步）成功 resolve void 并打信封', async () => {
        const { store, mock } = setup();
        await expect(store.set('k', { a: 1 })).resolves.toBeUndefined();
        expect(readEnvelope(mock.map.get('k'))).toEqual({ _v: 1, _val: { a: 1 } });
        expect(mock.calls.setStorage).toBe(1);
    });

    it('set（异步）原生 fail 原样 reject', async () => {
        const { store, mock } = setup();
        mock.failNextSet = true;
        await expect(store.set('k', 1)).rejects.toEqual({ errMsg: 'setStorage:fail exceed storage max size' });
    });

    it('set（异步）SetOptions 透传到信封 _exp', async () => {
        const restore = atTime(1000);
        const { store, mock } = setup();
        await store.set('k', 1, { ttl: 3000 });
        expect(readEnvelope(mock.map.get('k'))).toEqual({ _v: 1, _exp: 4000, _val: 1 });
        restore();
    });
});

// ===== get：命中与键缺失三级合成 =====

describe('get 读管线：拆封 + 键缺失三级合成', () => {
    it('getSync 命中拆封返回原值', () => {
        const { store, mock } = setup();
        store.setSync('k', { a: 1 });
        expect(store.getSync('k')).toEqual({ a: 1 });
        // 同步读锚点：getSync 退化调异步 getStorage 时计数不匹配即红
        expect(mock.calls.getStorageSync).toBe(1);
        expect(mock.calls.getStorage).toBe(0);
    });

    it('getSync 命中优先于调用级 defaultValue（命中 > 键缺失合成）', () => {
        const { store } = setup({ keyMissing: () => 'synth' });
        store.setSync('k', 'real');
        expect(store.getSync('k', 'fallback')).toBe('real');
    });

    it('get（异步）命中优先于调用级 defaultValue', async () => {
        const { store } = setup({ keyMissing: () => 'synth' });
        store.setSync('k', 'real');
        await expect(store.get('k', 'fallback')).resolves.toBe('real');
    });

    it('getSync 键缺失：兜底 undefined', () => {
        const { store } = setup();
        expect(store.getSync('nope')).toBeUndefined();
    });

    it('getSync 键缺失：调用级 defaultValue 优先', () => {
        const { store } = setup({ keyMissing: () => ({ from: 'instance' }) });
        expect(store.getSync('nope', { from: 'call' })).toEqual({ from: 'call' });
    });

    it('getSync 键缺失：实例级 keyMissing 函数次之', () => {
        const { store } = setup({ keyMissing: (key) => ({ from: 'instance', key }) });
        expect(store.getSync('nope')).toEqual({ from: 'instance', key: 'nope' });
    });

    it('getSync 键缺失：keyMissing 函数抛错直接上抛', () => {
        const { store } = setup({ keyMissing: () => { throw new Error('missing'); } });
        expect(() => store.getSync('nope')).toThrow('missing');
    });

    it('get（异步）命中返回原值', async () => {
        const { store } = setup();
        store.setSync('k', 'v');
        await expect(store.get('k')).resolves.toBe('v');
    });

    it('get（异步）键缺失（fail 路径归一）走三级合成', async () => {
        const { store } = setup({ keyMissing: () => 'synth' });
        await expect(store.get('nope')).resolves.toBe('synth');
        await expect(store.get('nope', 'call')).resolves.toBe('call');
    });

    it('get（异步）keyMissing 函数抛错转 reject', async () => {
        const { store } = setup({ keyMissing: () => { throw new Error('missing'); } });
        await expect(store.get('nope')).rejects.toThrow('missing');
    });

    it('get（异步）success 载荷为 null / 空串归一为键缺失（my 形状 / 原生缺陷语义）', async () => {
        const { store, mock } = setup();
        mock.map.set('a', null);
        mock.map.set('b', '');
        await expect(store.get('a')).resolves.toBeUndefined();
        await expect(store.get('b')).resolves.toBeUndefined();
        expect(store.getSync('a')).toBeUndefined();
        expect(store.getSync('b')).toBeUndefined();
    });

    it('库外写入的普通对象裸值原样返回，不误判信封', () => {
        const { store, mock } = setup();
        mock.map.set('foreign', { raw: true });
        expect(store.getSync('foreign')).toEqual({ raw: true });
        // 异步路径同样原样返回（settleAsync 的 foreign 分支）
        return expect(store.get('foreign')).resolves.toEqual({ raw: true });
    });

    it('get（异步）success 回调无载荷防御（rawRes falsy 归一键缺失）', async () => {
        const { store, mock } = setup();
        store.setSync('k', 'v');
        mock.bareSuccess = true;
        await expect(store.get('k')).resolves.toBeUndefined();
        await expect(store.has('k')).resolves.toBe(false);
    });
});

// ===== has =====

describe('has 命中判定', () => {
    it('hasSync 命中 true / 键缺失 false', () => {
        const { store } = setup();
        store.setSync('k', 1);
        expect(store.hasSync('k')).toBe(true);
        expect(store.hasSync('nope')).toBe(false);
    });

    it('has（异步）命中 true / 键缺失 false', async () => {
        const { store } = setup();
        store.setSync('k', 1);
        await expect(store.has('k')).resolves.toBe(true);
        await expect(store.has('nope')).resolves.toBe(false);
    });

    it('has 不受键缺失三级合成影响（纯判定，不产值）', async () => {
        const { store } = setup({ keyMissing: () => 'synth' });
        await expect(store.has('nope')).resolves.toBe(false);
        expect(store.hasSync('nope')).toBe(false);
    });
});

// ===== 过期驱逐 =====

describe('TTL 过期驱逐', () => {
    it('同步过期：直连物理键逐出，键缺失走三级合成', () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 100 });
        store.setSync('k', 1);
        restore();
        const out = atTime(2000);
        expect(store.getSync('k')).toBeUndefined();
        expect(mock.map.has('k')).toBe(false);
        out();
    });

    it('同步过期：带命名空间双前缀防护（逐出直连物理键）', () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ namespace: 'user', defaultTtl: 100 });
        store.setSync('k', 1);
        restore();
        const out = atTime(2000);
        expect(store.getSync('k')).toBeUndefined();
        expect(mock.map.has('user/k')).toBe(false);
        expect(mock.calls.removeStorageSync).toBe(1);
        out();
    });

    it('同步过期：逐出失败不改变键缺失语义，键残留可证（try 过逐出）', () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 100 });
        store.setSync('k', 1);
        restore();
        mock.removeThrowsOn = 'k';
        const out = atTime(2000);
        expect(store.getSync('k')).toBeUndefined();
        expect(mock.map.has('k')).toBe(true);
        out();
    });

    it('异步过期：逐出后按键缺失合成', async () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 100 });
        store.setSync('k', 1);
        restore();
        const out = atTime(2000);
        await expect(store.get('k')).resolves.toBeUndefined();
        await expect(store.has('k')).resolves.toBe(false);
        expect(mock.map.has('k')).toBe(false);
        out();
    });

    it('异步过期：逐出失败不改变键缺失语义', async () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ defaultTtl: 100 });
        store.setSync('k', 1);
        restore();
        mock.removeThrowsOn = 'k';
        const out = atTime(2000);
        await expect(store.get('k')).resolves.toBeUndefined();
        expect(mock.map.has('k')).toBe(true);
        out();
    });

    it('未过期命中不受影响', () => {
        const { store } = setup({ defaultTtl: 10000 });
        store.setSync('k', 'v');
        expect(store.getSync('k')).toBe('v');
        expect(store.hasSync('k')).toBe(true);
    });

    it('异步族命名空间：set/get 走物理前缀，过期逐出直连物理键', async () => {
        const restore = atTime(1000);
        const { store, mock } = setup({ namespace: 'user', defaultTtl: 100 });
        await store.set('k', 1);
        expect(mock.map.has('user/k')).toBe(true);
        restore();
        const out = atTime(2000);
        await expect(store.get('k')).resolves.toBeUndefined();
        expect(mock.map.has('user/k')).toBe(false);
        expect(mock.calls.removeStorageSync).toBe(1);
        out();
    });
});

// ===== remove =====

describe('remove 移除', () => {
    it('removeSync 前缀 + 删除', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('k', 1);
        store.removeSync('k');
        expect(mock.map.has('user/k')).toBe(false);
    });

    it('remove（异步）成功 resolve void', async () => {
        const { store, mock } = setup();
        store.setSync('k', 1);
        await expect(store.remove('k')).resolves.toBeUndefined();
        expect(mock.map.has('k')).toBe(false);
    });

    it('remove（异步）原生 fail 原样 reject', async () => {
        const { store, mock } = setup();
        mock.failNextRemove = true;
        await expect(store.remove('k')).rejects.toEqual({ errMsg: 'removeStorage:fail mock' });
    });
});

// ===== clear =====

describe('clear 实例域语义', () => {
    it('clearSync 有前缀只清本域，外域不动', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        store.setSync('b', 2);
        mock.map.set('app/other', 3);
        store.clearSync();
        expect(mock.map.has('user/a')).toBe(false);
        expect(mock.map.has('user/b')).toBe(false);
        expect(mock.map.has('app/other')).toBe(true);
    });

    it('clearSync 无前缀透传原生全域清空', () => {
        const { store, mock } = setup();
        store.setSync('a', 1);
        mock.map.set('foreign', 2);
        store.clearSync();
        expect(mock.map.size).toBe(0);
        expect(mock.calls.clearStorageSync).toBe(1);
        // 透传锚点：clearSync 退化调异步 clearStorage 时计数不匹配即红
        expect(mock.calls.clearStorage).toBe(0);
    });

    it('clear（异步）有前缀枚举删除后 resolve', async () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        mock.map.set('app/other', 2);
        await expect(store.clear()).resolves.toBeUndefined();
        expect(mock.map.has('user/a')).toBe(false);
        expect(mock.map.has('app/other')).toBe(true);
        // 真异步锚点：枚举走 getStorageInfo（非 getStorageInfoSync）、逐删走 removeStorage（非 removeStorageSync）
        expect(mock.calls.getStorageInfo).toBe(1);
        expect(mock.calls.getStorageInfoSync).toBe(0);
        expect(mock.calls.removeStorage).toBe(1);
        expect(mock.calls.removeStorageSync).toBe(0);
    });

    it('clear（异步）无前缀透传原生 clearStorage', async () => {
        const { store, mock } = setup();
        store.setSync('a', 1);
        await expect(store.clear()).resolves.toBeUndefined();
        expect(mock.map.size).toBe(0);
        expect(mock.calls.clearStorage).toBe(1);
        expect(mock.calls.clearStorageSync).toBe(0);
    });

    it('clear（异步）逐键 removeStorage 遇错即 reject、已删除不回滚', async () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        store.setSync('b', 2);
        mock.failRemoveOn = 'user/b';
        await expect(store.clear()).rejects.toEqual({ errMsg: 'removeStorage:fail mock' });
        expect(mock.map.has('user/a')).toBe(false);
        expect(mock.map.has('user/b')).toBe(true);
    });

    it('clearSync 枚举遇错即抛', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        mock.removeThrowsOn = 'user/a';
        expect(() => store.clearSync()).toThrow('removeStorageSync:fail mock');
    });

    it('clearSync 原生 info keys 缺省防御（keys undefined，不得兜底全域清空）', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        mock.omitKeys = true;
        expect(() => store.clearSync()).not.toThrow();
        expect(mock.map.has('user/a')).toBe(true);
    });

    it('clear（异步）原生 info keys 缺省防御（keys undefined，不得兜底全域清空）', async () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        mock.omitKeys = true;
        await expect(store.clear()).resolves.toBeUndefined();
        expect(mock.map.has('user/a')).toBe(true);
    });

    it('clear（异步）无前缀透传原生 fail 原样 reject', async () => {
        const { store, mock } = setup();
        mock.failNextClear = true;
        await expect(store.clear()).rejects.toEqual({ errMsg: 'clearStorage:fail mock' });
    });
});

// ===== info =====

describe('info 实例域统计', () => {
    it('infoSync keys 过滤去前缀，大小字段透传全域值', () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        store.setSync('b', 2);
        mock.map.set('app/other', 3);
        const info = store.infoSync();
        expect(info.keys.sort()).toEqual(['a', 'b']);
        expect(info.currentSize).toBe(1);
        expect(info.limitSize).toBe(10);
    });

    it('info（异步）同形态', async () => {
        const { store, mock } = setup({ namespace: 'user' });
        store.setSync('a', 1);
        mock.map.set('app/other', 2);
        const info = await store.info();
        expect(info.keys).toEqual(['a']);
        expect(info.currentSize).toBe(1);
        expect(info.limitSize).toBe(10);
    });

    it('info（异步/同步）原生 keys 缺省防御（keys undefined 归空数组）', async () => {
        const { store, mock } = setup({ namespace: 'user' });
        mock.omitKeys = true;
        const info = await store.info();
        expect(info.keys).toEqual([]);
        expect(store.infoSync().keys).toEqual([]);
        expect(info.currentSize).toBe(1);
    });

    it('info（异步）原生 fail 原样 reject', async () => {
        const { store, mock } = setup();
        mock.failNextInfo = true;
        await expect(store.info()).rejects.toEqual({ errMsg: 'getStorageInfo:fail mock' });
    });

    it('无前缀实例 info keys 即全域原样', () => {
        const { store, mock } = setup();
        store.setSync('a', 1);
        mock.map.set('foreign', 2);
        expect(store.infoSync().keys.sort()).toEqual(['a', 'foreign']);
    });
});

// ===== 泛型键表（类型层验证：编译通过即断言成立） =====

describe('泛型键表', () => {
    it('Schema 约束下键名与值类型受检，keyMissing 函数签名受键约束', () => {
        interface Schema { profile: { name: string }; token: string }
        const { store } = setup<Schema>({ keyMissing: (key) => (key === 'profile' ? { name: 'anon' } : 'anon-token') });
        store.setSync('profile', { name: 'A' });
        const profile: { name: string } | undefined = store.getSync('profile');
        const token: string | undefined = store.getSync('token');
        expect(profile).toEqual({ name: 'A' });
        expect(token).toBe('anon-token');
        expect(store.getSync('token', 'fallback')).toBe('fallback');
    });

    it('get / getSync 提供 defaultValue 时返回类型收窄为 Schema[K]（不含 undefined）', async () => {
        interface Schema { profile: { name: string }; token: string }
        const { store } = setup<Schema>();
        // 编译期断言：以下注解仅在类型收窄后成立（string | undefined 不能赋给 string）
        const narrowedSync: string = store.getSync('token', 'fallback');
        const narrowed: string = await store.get('token', 'call');
        const widenedSync: string | undefined = store.getSync('token');
        const widened: string | undefined = await store.get('token');
        expect(narrowedSync).toBe('fallback');
        expect(narrowed).toBe('call');
        expect(widenedSync).toBeUndefined();
        expect(widened).toBeUndefined();
    });
});
