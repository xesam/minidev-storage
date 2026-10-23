import { createStorage, createMyNative, storage, createStorageInstance } from '../src/index';

// ---- 模拟 my 全局：内存 Map + my 官方形状（异步回调族：键缺失 success + data null；
// ---- 同步族：对象参数 + {data}/{success} 包装，键缺失 { data: null }——2026-11 支付宝 IDE 实测） ----

let map: Map<string, unknown>;
// 分支插桩：把「归一走的是哪条原生键缺失分支」变成可断言前提，而非只靠读 mock 源码确认
let nullMissCalls = 0;
let clearSyncCalls = 0;

function installMy(): Map<string, unknown> {
    map = new Map();
    nullMissCalls = 0;
    clearSyncCalls = 0;
    (globalThis as any).my = {
        setStorage: (o: any) => {
            map.set(o.key, o.data);
            // my 官方 success 回调不携带 wx 式 errMsg
            o.success && o.success({});
        },
        setStorageSync: (o: any) => {
            map.set(o.key, o.data);
            return { success: true };
        },
        getStorage: (o: any) => {
            // 官方 Bugs & Tips：my.getStorage 对不存在的 key 不报错，走 success 回调且 data 为 null
            if (!map.has(o.key)) {
                nullMissCalls++;
                o.success && o.success({ data: null });
                return;
            }
            o.success && o.success({ data: map.get(o.key) });
        },
        // 官方对象契约 + IDE 实测形状：命中 { data, success } 包装；键缺失 { data: null }（无 success 字段）
        getStorageSync: (o: any) => (map.has(o.key) ? { data: map.get(o.key), success: true } : { data: null }),
        removeStorage: (o: any) => {
            map.delete(o.key);
            o.success && o.success({});
        },
        removeStorageSync: (o: any) => {
            map.delete(o.key);
            return { success: true };
        },
        clearStorage: (o: any) => {
            map.clear();
            o.success && o.success({});
        },
        clearStorageSync: () => {
            clearSyncCalls++;
            map.clear();
        },
        getStorageInfo: (o: any) => {
            o.success && o.success({ keys: [...map.keys()], currentSize: 1, limitSize: 10 });
        },
        getStorageInfoSync: () => ({ keys: [...map.keys()], currentSize: 1, limitSize: 10 })
    };
    return map;
}

afterEach(() => {
    delete (globalThis as any).my;
    jest.restoreAllMocks();
});

describe('my 平台包（统一 API）', () => {
    it('默认单例 createStorage() 与 createMyNative 导出面就绪', () => {
        expect(typeof storage.setSync).toBe('function');
        expect(typeof storage.get).toBe('function');
        expect(typeof createStorage).toBe('function');
        expect(typeof createMyNative).toBe('function');
        expect(typeof createStorageInstance).toBe('function');
    });

    it('懒绑：my 缺席时模块加载不抛', () => {
        delete (globalThis as any).my;
        expect(() => {
            jest.isolateModules(() => {
                require('../src/index');
            });
        }).not.toThrow();
    });

    it('懒绑：my 缺席时首次调用才抛（misuse 不设防）', () => {
        expect(() => storage.setSync('k', 1)).toThrow();
    });

    it('setSync 经 createMyNative 绑定 my 并打信封', () => {
        const m = installMy();
        storage.setSync('k', { a: 1 });
        expect(m.get('k')).toEqual({ _v: 1, _val: { a: 1 } });
    });

    it('getSync 拆信封返回原值；my 同步键缺失（对象形式 { data: null } 解包为 null）归一为 undefined', () => {
        installMy();
        storage.setSync('k', { a: 1 });
        expect(storage.getSync('k')).toEqual({ a: 1 });
        expect(storage.getSync('nope')).toBeUndefined();
        expect(storage.getSync('nope', 'fallback')).toBe('fallback');
    });

    it('同步族按官方对象契约调用（key/data 走对象参数，防回退位置参数）', () => {
        installMy();
        const g = globalThis as any;
        const seen: any[] = [];
        const raw = g.my.setStorageSync;
        g.my.setStorageSync = (o: any) => {
            seen.push(o);
            return raw(o);
        };
        storage.setSync('k', 1);
        expect(seen).toEqual([{ key: 'k', data: { _v: 1, _val: 1 } }]);
    });

    it('同步族错误形状原样抛（Android success:false / IDE、iOS 裸 error）', () => {
        installMy();
        const my = (globalThis as any).my;
        my.setStorageSync = () => ({ success: false, error: 12, errorMessage: '存储总大小达到上限' });
        my.getStorageSync = () => ({ error: 2, errorMessage: '接口参数无效' });
        my.removeStorageSync = () => ({ success: false, error: 2, errorMessage: '接口参数无效' });
        const catchOf = (fn: () => void) => {
            try {
                fn();
            } catch (e) {
                return e;
            }
            return undefined;
        };
        expect(catchOf(() => storage.setSync('k', 1))).toEqual({ success: false, error: 12, errorMessage: '存储总大小达到上限' });
        expect(catchOf(() => storage.getSync('k'))).toEqual({ error: 2, errorMessage: '接口参数无效' });
        expect(catchOf(() => storage.removeSync('k'))).toEqual({ success: false, error: 2, errorMessage: '接口参数无效' });
    });

    it('同步族返回无载荷（undefined）不误判为错误：set/remove 静默、get 归一键缺失', () => {
        installMy();
        const my = (globalThis as any).my;
        my.setStorageSync = () => undefined;
        my.getStorageSync = () => undefined;
        my.removeStorageSync = () => undefined;
        expect(() => storage.setSync('k', 1)).not.toThrow();
        expect(() => storage.removeSync('k')).not.toThrow();
        expect(storage.getSync('k')).toBeUndefined();
    });

    it('createStorage({ namespace, defaultTtl, recordAt }) 全链生效', () => {
        const m = installMy();
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const store = createStorage({ namespace: 'user', defaultTtl: 5000, recordAt: true });
        store.setSync('profile', 'x');
        expect(m.get('user/profile')).toEqual({ _v: 1, _at: 1000, _exp: 6000, _val: 'x' });
        expect(store.getSync('profile')).toBe('x');
        expect(store.hasSync('profile')).toBe(true);
    });

    it('过期信封：异步 get 过期逐出后键缺失归一（统一契约）', async () => {
        installMy();
        const store = createStorage({ defaultTtl: 100 });
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        store.setSync('k', 1);
        (Date.now as jest.Mock).mockReturnValue(2000);
        await expect(store.get('k')).resolves.toBeUndefined();
        await expect(store.has('k')).resolves.toBe(false);
    });

    it('未写入键：异步 get 键缺失（success + data null 归一）合成', async () => {
        installMy();
        await expect(storage.get('nope')).resolves.toBeUndefined();
        await expect(storage.get('nope', 'call')).resolves.toBe('call');
        // 归一确走 my 特有的 success+null 分支（而非误 mock 成其他端形状仍静默通过）
        expect(nullMissCalls).toBe(2);
    });

    it('set（异步）resolve void / remove / clear 全链', async () => {
        const m = installMy();
        await expect(storage.set('k', 1)).resolves.toBeUndefined();
        expect(m.has('k')).toBe(true);
        await expect(storage.get('k')).resolves.toBe(1);
        await expect(storage.remove('k')).resolves.toBeUndefined();
        expect(m.has('k')).toBe(false);
        await expect(storage.clear()).resolves.toBeUndefined();
        expect(m.size).toBe(0);
    });

    it('removeSync / infoSync 绑定', () => {
        installMy();
        const store = createStorage({ namespace: 'user' });
        store.setSync('a', 1);
        store.setSync('b', 2);
        expect(store.infoSync().keys.sort()).toEqual(['a', 'b']);
        store.removeSync('a');
        expect(store.infoSync().keys).toEqual(['b']);
    });

    it('info（异步）keys 过滤去前缀', async () => {
        const m = installMy();
        const store = createStorage({ namespace: 'user' });
        m.set('app/other', 1);
        store.setSync('a', 1);
        const info = await store.info();
        expect(info.keys).toEqual(['a']);
        expect(info.currentSize).toBe(1);
    });

    it('clearSync 有前缀只清本域', () => {
        const m = installMy();
        const store = createStorage({ namespace: 'user' });
        store.setSync('a', 1);
        m.set('app/other', 1);
        store.clearSync();
        expect(m.has('user/a')).toBe(false);
        expect(m.has('app/other')).toBe(true);
    });

    it('零配置单例 clearSync 透传原生（全域）', () => {
        const m = installMy();
        storage.setSync('a', 1);
        m.set('foreign', 2);
        storage.clearSync();
        expect(m.size).toBe(0);
        // 透传锚点：走原生 clearStorageSync，而非枚举逐删路径
        expect(clearSyncCalls).toBe(1);
    });
});
