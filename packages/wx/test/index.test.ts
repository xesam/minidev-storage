import { createStorage, createWxNative, storage, createStorageInstance } from '../src/index';

// ---- 模拟 wx 全局：内存 Map + wx 形状回调语义（键缺失：同步 '' / 异步 fail） ----

let map: Map<string, unknown>;
// 分支插桩：把「归一走的是哪条原生键缺失分支」变成可断言前提，而非只靠读 mock 源码确认
let failCalls = 0;
let clearSyncCalls = 0;

function installWx(): Map<string, unknown> {
    map = new Map();
    failCalls = 0;
    clearSyncCalls = 0;
    (globalThis as any).wx = {
        setStorage: (o: any) => {
            map.set(o.key, o.data);
            o.success && o.success({ errMsg: 'setStorage:ok' });
        },
        setStorageSync: (k: string, d: unknown) => {
            map.set(k, d);
        },
        getStorage: (o: any) => {
            if (!map.has(o.key)) {
                failCalls++;
                o.fail && o.fail({ errMsg: 'getStorage:fail data not found' });
                return;
            }
            o.success && o.success({ data: map.get(o.key), errMsg: 'getStorage:ok' });
        },
        getStorageSync: (k: string) => (map.has(k) ? map.get(k) : ''),
        removeStorage: (o: any) => {
            map.delete(o.key);
            o.success && o.success({ errMsg: 'removeStorage:ok' });
        },
        removeStorageSync: (k: string) => {
            map.delete(k);
        },
        clearStorage: (o: any) => {
            map.clear();
            o.success && o.success({ errMsg: 'clearStorage:ok' });
        },
        clearStorageSync: () => {
            clearSyncCalls++;
            map.clear();
        },
        getStorageInfo: (o: any) => {
            o.success && o.success({ keys: [...map.keys()], currentSize: 1, limitSize: 10, errMsg: 'getStorageInfo:ok' });
        },
        getStorageInfoSync: () => ({ keys: [...map.keys()], currentSize: 1, limitSize: 10 })
    };
    return map;
}

afterEach(() => {
    delete (globalThis as any).wx;
    jest.restoreAllMocks();
});

describe('wx 平台包（统一 API）', () => {
    it('默认单例 createStorage() 与 createWxNative 导出面就绪', () => {
        expect(typeof storage.setSync).toBe('function');
        expect(typeof storage.get).toBe('function');
        expect(typeof createStorage).toBe('function');
        expect(typeof createWxNative).toBe('function');
        expect(typeof createStorageInstance).toBe('function');
    });

    it('懒绑：wx 缺席时模块加载不抛', () => {
        delete (globalThis as any).wx;
        expect(() => {
            jest.isolateModules(() => {
                require('../src/index');
            });
        }).not.toThrow();
    });

    it('懒绑：wx 缺席时首次调用才抛（misuse 不设防）', () => {
        expect(() => storage.setSync('k', 1)).toThrow();
    });

    it('setSync 经 createWxNative 绑定 wx 并打信封', () => {
        const m = installWx();
        storage.setSync('k', { a: 1 });
        expect(m.get('k')).toEqual({ _v: 1, _val: { a: 1 } });
    });

    it('getSync 拆信封返回原值；未写入键统一返回 undefined', () => {
        installWx();
        storage.setSync('k', { a: 1 });
        expect(storage.getSync('k')).toEqual({ a: 1 });
        expect(storage.getSync('nope')).toBeUndefined();
        // wx 同步键缺失 原生返回 ''，统一契约归一为键缺失（合成路径）
        expect(storage.getSync('nope', 'fallback')).toBe('fallback');
    });

    it('createStorage({ namespace, defaultTtl, recordAt }) 全链生效', () => {
        const m = installWx();
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const store = createStorage({ namespace: 'user', defaultTtl: 5000, recordAt: true });
        store.setSync('profile', 'x');
        expect(m.get('user/profile')).toEqual({ _v: 1, _at: 1000, _exp: 6000, _val: 'x' });
        expect(store.getSync('profile')).toBe('x');
        expect(store.hasSync('profile')).toBe(true);
    });

    it('过期信封：异步 get 过期逐出后键缺失归一（统一契约）', async () => {
        installWx();
        const store = createStorage({ defaultTtl: 100 });
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        store.setSync('k', 1);
        (Date.now as jest.Mock).mockReturnValue(2000);
        await expect(store.get('k')).resolves.toBeUndefined();
        await expect(store.has('k')).resolves.toBe(false);
    });

    it('未写入键：异步 get 键缺失（wx fail 路径）合成 / defaultValue 参数', async () => {
        installWx();
        await expect(storage.get('nope')).resolves.toBeUndefined();
        await expect(storage.get('nope', 'call')).resolves.toBe('call');
        // 归一确走 wx 原生 fail 分支（而非误 mock 成其他端形状仍静默通过）
        expect(failCalls).toBe(2);
    });

    it('set（异步）resolve void / remove / clear 全链', async () => {
        const m = installWx();
        await expect(storage.set('k', 1)).resolves.toBeUndefined();
        expect(m.has('k')).toBe(true);
        await expect(storage.get('k')).resolves.toBe(1);
        await expect(storage.remove('k')).resolves.toBeUndefined();
        expect(m.has('k')).toBe(false);
        await expect(storage.clear()).resolves.toBeUndefined();
        expect(m.size).toBe(0);
    });

    it('removeSync / infoSync 绑定', () => {
        installWx();
        const store = createStorage({ namespace: 'user' });
        store.setSync('a', 1);
        store.setSync('b', 2);
        expect(store.infoSync().keys.sort()).toEqual(['a', 'b']);
        store.removeSync('a');
        expect(store.infoSync().keys).toEqual(['b']);
    });

    it('info（异步）keys 过滤去前缀', async () => {
        const m = installWx();
        const store = createStorage({ namespace: 'user' });
        m.set('app/other', 1);
        store.setSync('a', 1);
        const info = await store.info();
        expect(info.keys).toEqual(['a']);
        expect(info.currentSize).toBe(1);
    });

    it('clearSync 有前缀只清本域', () => {
        const m = installWx();
        const store = createStorage({ namespace: 'user' });
        store.setSync('a', 1);
        m.set('app/other', 1);
        store.clearSync();
        expect(m.has('user/a')).toBe(false);
        expect(m.has('app/other')).toBe(true);
    });

    it('零配置单例 clearSync 透传原生（全域）', () => {
        const m = installWx();
        storage.setSync('a', 1);
        m.set('foreign', 2);
        storage.clearSync();
        expect(m.size).toBe(0);
        // 透传锚点：走原生 clearStorageSync，而非枚举逐删路径
        expect(clearSyncCalls).toBe(1);
    });
});
