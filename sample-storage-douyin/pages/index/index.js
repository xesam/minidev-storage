// @mini-dev/storage 抖音小程序示例（统一 API）
//
// 形态：
//   1. 统一 API：12 方法短名族，裸名 = 异步（Promise）、*Sync = 同步直返；
//      不复刻原生 *Storage 形状，键级控制走 set/setSync 第三参 SetOptions
//   2. 键缺失三级合成：调用级 defaultValue > 实例级 keyMissing(key) 函数 > undefined
//   3. 物理存储统一为信封对象：{_v,_at?,_exp?,_val}
// 库通过 require 消费（CJS）；平台包 @mini-dev/storage-tt 再导出核心类型。
const { createStorage, storage } = require('@mini-dev/storage-tt');

// 模块级实例：配置创建时一次给定，创建后冻结（想换配置另建实例）。
const userStore = createStorage({
    namespace: 'user',
    defaultTtl: 7 * 864e5,
    recordAt: true
});
const cartStore = createStorage({ namespace: 'cart' });
const keyMissingStore = createStorage({ keyMissing: (key) => ({ synth: true, key }) });

Page({
    data: { logText: '', scrollTop: 0 },
    logs: [],

    fmt(v) {
        if (typeof v === 'string') return v ? v : '""';
        return JSON.stringify(v);
    },

    say(text) {
        console.log(text);
        this.logs.push(text);
        const logs = this.logs.slice(-100);
        this.setData({ logText: logs.join('\n'), scrollTop: logs.length * 200 });
    },

    head(no, title) {
        this.say(`\n╭─ ${no} · ${title}\n│`);
    },

    onTapClearLog() {
        this.logs = [];
        this.setData({ logText: '', scrollTop: 0 });
    },

    // ===== 01 实例工厂：配置一次给定 + 物理信封 =====
    onTapFactory() {
        this.head('01', '实例工厂与物理信封');
        this.say('配置 createStorage({ namespace: "user", defaultTtl: 7d, recordAt: true })');
        userStore.setSync('profile', { name: 'A' });
        const raw = tt.getStorageSync('user/profile');
        this.say(`物理存储 user/profile = ${this.fmt(raw)}`);
        this.say(`getSync('profile') = ${this.fmt(userStore.getSync('profile'))}（信封已拆，API 表层始终原值）`);
    },

    // ===== 02 命名空间隔离 =====
    onTapNamespace() {
        this.head('02', '命名空间隔离');
        userStore.setSync('shared', 'from-user');
        cartStore.setSync('shared', 'from-cart');
        storage.setSync('shared', 'from-global');
        this.say(`user.getSync('shared') = ${this.fmt(userStore.getSync('shared'))}`);
        this.say(`cart.getSync('shared')  = ${this.fmt(cartStore.getSync('shared'))}`);
        this.say(`storage.getSync('shared') = ${this.fmt(storage.getSync('shared'))}（零配置单例无前缀）`);
        this.say(`user 域 keys = [${userStore.infoSync().keys}]（去前缀逻辑键）`);
    },

    // ===== 03 异步族：Promise 形态 =====
    async onTapSetGet() {
        this.head('03', '异步族：set / get / has');
        await storage.set('async-key', { v: 1 });
        const got = await storage.get('async-key');
        const hit = await storage.has('async-key');
        this.say(`await set('async-key', {v:1}) → void`);
        this.say(`await get('async-key') = ${this.fmt(got)}`);
        this.say(`await has('async-key') = ${this.fmt(hit)}`);
    },

    // ===== 03 异步族：键缺失三级合成 =====
    async onTapKeyMissing() {
        this.head('03', '键缺失三级合成');
        this.say(`get('nope') = ${this.fmt(await storage.get('nope'))}（兜底 undefined）`);
        this.say(`get('nope', '默认值') = ${this.fmt(await storage.get('nope', '默认值'))}（调用级优先）`);
        const got = await keyMissingStore.get('nope');
        this.say(`keyMissingStore.get('nope') = ${this.fmt(got)}（实例级 keyMissing 函数）`);
        this.say(`getSync 同构：${this.fmt(keyMissingStore.getSync('nope'))}`);
    },

    // ===== 03 异步族：remove =====
    async onTapRemoveAsync() {
        this.head('03', '异步族：remove');
        await storage.set('r-key', 1);
        await storage.remove('r-key');
        this.say(`await remove('r-key') → void；has = ${this.fmt(await storage.has('r-key'))}`);
    },

    // ===== 04 同步族：直返形态 + SetOptions =====
    onTapSync() {
        this.head('04', '同步族：setSync / getSync / hasSync');
        userStore.setSync('session', 's-token');
        userStore.setSync('flash', 'x', { ttl: 200 });
        this.say(`getSync('session') = ${this.fmt(userStore.getSync('session'))}（继承 defaultTtl）`);
        this.say(`getSync('flash') = ${this.fmt(userStore.getSync('flash'))}（{ ttl: 200 } 覆盖）`);
        this.say(`hasSync('session') = ${this.fmt(userStore.hasSync('session'))}`);
    },

    // ===== 04 同步族：removeSync =====
    onTapRemoveSync() {
        this.head('04', '同步族：removeSync');
        userStore.setSync('rm', 1);
        userStore.removeSync('rm');
        this.say(`removeSync('rm') → void；hasSync = ${this.fmt(userStore.hasSync('rm'))}`);
    },

    // ===== 05 TTL 过期驱逐 =====
    async onTapTtl() {
        this.head('05', 'TTL 过期驱逐');
        await userStore.set('flash2', 'now', { ttl: 150 });
        const hit = await userStore.get('flash2');
        this.say(`flash2 命中 = ${this.fmt(hit)}`);
        await userStore.set('forever', 'x', { ttl: 0 });
        await new Promise((r) => setTimeout(r, 250));
        this.say(`150ms 后 get('flash2') = ${this.fmt(await userStore.get('flash2'))}（统一键缺失，无端差异）`);
        this.say(`ttl:0 永存键 250ms 后仍命中 = ${this.fmt(await userStore.get('forever'))}`);
        this.say(`同步读 getSync('flash2') = ${this.fmt(userStore.getSync('flash2'))}；has = ${this.fmt(await userStore.has('flash2'))}`);
    },

    // ===== 06 实例域 clear =====
    async onTapClearScope() {
        this.head('06', '实例域 clear（异步）');
        await userStore.set('a', 1);
        await userStore.set('b', 2);
        await storage.set('outside', 3);
        const before = await userStore.info();
        await userStore.clear();
        const after = await userStore.info();
        this.say(`清空前 user keys = [${before.keys}] → 清空后 = [${after.keys}]`);
        this.say(`storage 域 outside 仍在 = ${this.fmt(await storage.has('outside'))}（只清本域）`);
    },

    async onTapClearSync() {
        this.head('06', '实例域 clearSync（同步）');
        await userStore.set('c', 1);
        userStore.clearSync();
        this.say(`clearSync 后 user keys = [${userStore.infoSync().keys}]`);
        this.say(`storage.getSync('outside') = ${this.fmt(storage.getSync('outside'))}（他域不受影响）`);
    },

    // ===== 07 info 统计 =====
    async onTapInfo() {
        this.head('07', 'info / infoSync 统计');
        const info = await storage.info();
        const syncInfo = storage.infoSync();
        this.say(`await info() → keys(${info.keys.length} 个) / currentSize ${info.currentSize}KB / limitSize ${info.limitSize}KB`);
        this.say(`infoSync() → keys(${syncInfo.keys.length} 个)（keys 为全域原样，无前缀实例）`);
    },

    // ===== 08 库外互操作 =====
    async onTapInterop() {
        this.head('08', '库外互操作');
        tt.setStorageSync('foreign', { raw: true });
        this.say(`原生写 {raw:true} → getSync = ${this.fmt(storage.getSync('foreign'))}（原样，不误判信封）`);
        await storage.set('lib-key', 'v');
        this.say(`库写 'v' → 原生 tt.getStorageSync = ${this.fmt(tt.getStorageSync('lib-key'))}（见信封对象）`);
        tt.setStorageSync('empty-demo', ''); // 库外原生裸写空串
        this.say(`库外裸写 ''：'' 与未命中在原生即不可区分，库统一归一为键缺失（get = ${this.fmt(storage.getSync('empty-demo'))}）`);
    }
});
