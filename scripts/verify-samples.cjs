// Drives each sample through the real built library with mocked platform globals.
//
// 示例直接依赖两件——平台包（如 @mini-dev/storage-wx，workspace:* → packages/wx）与核心
// @mini-dev/storage（workspace:* → packages/core）。核心零运行时依赖（v1 无 koa-compose）。
// 微信「构建 npm」只处理示例顶层 node_modules 里的包，不钻进 pnpm 嵌套
// node_modules 找传递依赖；核心若非示例直接依赖，就不会被构建进 miniprogram_npm。
// 运行前需 `pnpm install`（填充示例 node_modules 的 workspace 软链）+ `pnpm run build`（产出各包 dist）。
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

let tmpCounter = 0;

const REPO = path.resolve(__dirname, '..');

// 示例名 → 平台包 / 平台全局 / 端键缺失风格（2026-10 官方文档复核）+ 同步族签名（2026-11 支付宝 IDE 实测）。
// 运行期两件（平台包 + @mini-dev/storage）都必须在示例 package.json 的 dependencies 里声明，
// 否则微信「构建 npm」不会构建进 miniprogram_npm；其余端按同规保守约束。
const SAMPLES = [
    { name: 'wechat', dir: 'sample-storage-wechat', platformPkg: '@mini-dev/storage-wx', platformGlobal: 'wx', keyMissingStyle: 'fail', syncSignature: 'positional' },
    { name: 'alipay', dir: 'sample-storage-alipay', platformPkg: '@mini-dev/storage-my', platformGlobal: 'my', keyMissingStyle: 'null', syncSignature: 'object' },
    { name: 'douyin', dir: 'sample-storage-douyin', platformPkg: '@mini-dev/storage-tt', platformGlobal: 'tt', keyMissingStyle: 'fail', syncSignature: 'positional' }
];

function checkSampleDeps(sample) {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, sample.dir, 'package.json'), 'utf8'));
    const deps = pkg.dependencies || {};
    const required = [sample.platformPkg, '@mini-dev/storage'];
    for (const d of required) {
        if (!deps[d]) bad(`[${sample.name}] package.json 缺少直接依赖 ${d}——微信「构建 npm」不递归 pnpm 嵌套 node_modules，运行期两件都必须在示例顶层声明`);
        else ok(`[${sample.name}] 直接依赖 ${d}`);
    }
}

function clearPackageCache() {
    for (const k of Object.keys(require.cache)) {
        if (k.includes('@mini-dev/storage') || /packages[/](core|wx|my|tt)[/]dist[/]/.test(k)) {
            delete require.cache[k];
        }
    }
}

// 内存 Map 版原生 storage，键缺失行为与同步族签名按端：
//   'fail'（wx/tt 官方文档/实测）：key 不存在走 fail({ errMsg: 'getStorage:fail data not found' })，同步返回 ''；
//   'null'（my 官方 Bugs & Tips 明文）：key 不存在不报错、走 success 且 data 为 null。
//   syncSignature 'object'（my 官方文档 + 2026-11 支付宝 IDE 实测）：同步族对象参数、返回
//     { data } / { success } 包装（键缺失 { data: null }），位置参数已失效；
//   syncSignature 'positional'（wx/tt）：同步族位置参数、直返原值。
function makeNative(map, keyMissingStyle, syncSignature) {
    const objectSync = syncSignature === 'object';
    return {
        setStorage: (o) => {
            map.set(o.key, o.data);
            o.success && o.success({ errMsg: 'setStorage:ok' });
            o.complete && o.complete();
        },
        setStorageSync: objectSync
            ? (o) => { map.set(o.key, o.data); return { success: true }; }
            : (k, d) => { map.set(k, d); },
        getStorage: (o) => {
            if (!map.has(o.key)) {
                if (keyMissingStyle === 'null') {
                    o.success && o.success({ data: null });
                } else {
                    o.fail && o.fail({ errMsg: 'getStorage:fail data not found' });
                }
                o.complete && o.complete();
                return;
            }
            o.success && o.success({ data: map.get(o.key), errMsg: 'getStorage:ok' });
            o.complete && o.complete();
        },
        getStorageSync: objectSync
            ? (o) => (map.has(o.key) ? { data: map.get(o.key), success: true } : { data: null })
            : (k) => (map.has(k) ? map.get(k) : (keyMissingStyle === 'null' ? null : '')),
        removeStorage: (o) => {
            map.delete(o.key);
            o.success && o.success({ errMsg: 'removeStorage:ok' });
            o.complete && o.complete();
        },
        removeStorageSync: objectSync
            ? (o) => { map.delete(o.key); return { success: true }; }
            : (k) => { map.delete(k); },
        clearStorage: (o) => {
            map.clear();
            o.success && o.success({ errMsg: 'clearStorage:ok' });
            o.complete && o.complete();
        },
        clearStorageSync: () => { map.clear(); },
        getStorageInfo: (o) => {
            o.success && o.success({ keys: [...map.keys()], currentSize: 1, limitSize: 10, errMsg: 'getStorageInfo:ok' });
            o.complete && o.complete();
        },
        getStorageInfoSync: () => ({ keys: [...map.keys()], currentSize: 1, limitSize: 10 })
    };
}

function loadSample(sampleDir, srcPath, platformGlobal, keyMissingStyle, syncSignature) {
    clearPackageCache();
    let pageDef = null;
    global.Page = (def) => { pageDef = def; };
    const map = new Map();
    globalThis[platformGlobal] = makeNative(map, keyMissingStyle, syncSignature);
    let code = fs.readFileSync(srcPath, 'utf8');
    // alipay 示例用 ESM（IDE transpile）：import → require 后写进示例目录加载
    code = code.replace(/^import\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"]);/gm, 'const {$1} = require($2);');
    const tmp = path.join(sampleDir, `.verify-sample-${tmpCounter++}.cjs`);
    fs.writeFileSync(tmp, code);
    try { require(tmp); }
    catch (e) { bad(`load failed: ` + e.message); fs.unlinkSync(tmp); return null; }
    fs.unlinkSync(tmp);
    return { pageDef, map };
}

// 统一 API 契约断言：键缺失 / 文案 / 返回值三端一致（库契约），断言不再分端。
// mock 端 keyMissingStyle 仅用于复刻原生物理形状（wx/tt '' / my null），断言全部统一。
const TAP_ASSERTS = [
    { tap: 'onTapFactory', test: (r) => /物理存储 user\/profile = \{"_v":1,"_val":\{"name":"A"\},"_at":\d+,"_exp":\d+\}/.test(r) && /getSync\('profile'\) = \{"name":"A"\}/.test(r), label: '01 工厂与物理信封（物理是信封、库读是原值）' },
    { tap: 'onTapNamespace', test: (r) => /user\.getSync\('shared'\) = from-user/.test(r) && /cart\.getSync\('shared'\)  = from-cart/.test(r) && /storage\.getSync\('shared'\) = from-global/.test(r) && /user 域 keys = \[\S*shared\]/.test(r), label: '02 命名空间隔离（三实例同 key）' },
    { tap: 'onTapSetGet', test: (r) => /await set\('async-key', \{v:1\}\) → void/.test(r) && /await get\('async-key'\) = \{"v":1\}/.test(r) && /await has\('async-key'\) = true/.test(r), label: '03 异步 set / get / has（Promise 直返）' },
    { tap: 'onTapKeyMissing', test: (r) => /get\('nope'\) = undefined（兜底 undefined）/.test(r) && /get\('nope', '默认值'\) = 默认值/.test(r) && /keyMissingStore\.get\('nope'\) = \{"synth":true,"key":"nope"\}/.test(r) && /getSync 同构：\{"synth":true,"key":"nope"\}/.test(r), label: '03 键缺失三级合成（undefined → 调用级 → 实例级，getSync 同构）' },
    { tap: 'onTapRemoveAsync', test: (r) => /await remove\('r-key'\) → void；has = false/.test(r), label: '03 异步 remove' },
    { tap: 'onTapSync', test: (r) => /getSync\('session'\) = s-token/.test(r) && /getSync\('flash'\) = x/.test(r) && /hasSync\('session'\) = true/.test(r), label: '04 同步 setSync / getSync / hasSync（SetOptions.ttl 覆盖）' },
    { tap: 'onTapRemoveSync', test: (r) => /removeSync\('rm'\) → void；hasSync = false/.test(r), label: '04 同步 removeSync' },
    { tap: 'onTapTtl', test: (r) => /flash2 命中 = now/.test(r) && /150ms 后 get\('flash2'\) = undefined（统一键缺失，无端差异）/.test(r) && /ttl:0 永存键 250ms 后仍命中 = x/.test(r) && /同步读 getSync\('flash2'\) = undefined；has = false/.test(r), label: '05 TTL 驱逐（统一键缺失，三端同断言）+ ttl:0 置零永存' },
    { tap: 'onTapClearScope', test: (r) => /清空前 user keys = \[\S*a,b\]/.test(r) && /清空后 = \[\]/.test(r) && /storage 域 outside 仍在 = true/.test(r), label: '06 实例域 clear（本域 only）' },
    { tap: 'onTapClearSync', test: (r) => /clearSync 后 user keys = \[\]/.test(r) && /storage\.getSync\('outside'\) = 3/.test(r), label: '06 clearSync（同步实例域）' },
    { tap: 'onTapInfo', test: (r) => /await info\(\) → keys\(\d+ 个\) \/ currentSize 1KB \/ limitSize 10KB/.test(r) && /infoSync\(\) → keys\(\d+ 个\)/.test(r), label: '07 info / infoSync' },
    { tap: 'onTapInterop', test: (r) => /原生写 \{raw:true\} → getSync = \{"raw":true\}/.test(r) && /原生 \w+\.getStorageSync = \{"_v":1,"_val":"v"\}/.test(r) && /get = undefined/.test(r), label: '08 库外互操作（原样读 + 原生读见信封 + 库外裸写空串归一键缺失）' }
];

async function drive(sample) {
    const { name, dir, platformGlobal, keyMissingStyle, syncSignature } = sample;
    const sampleDir = path.join(REPO, dir);
    const srcPath = path.join(sampleDir, 'pages/index/index.js');
    console.log('== ' + name + ' ==');
    checkSampleDeps(sample);
    const loaded = loadSample(sampleDir, srcPath, platformGlobal, keyMissingStyle, syncSignature);
    if (!loaded) return;
    const { pageDef, map } = loaded;
    // mockThis = Page 定义（含 head/say/log/missView 等辅助方法）+ mock 的 data / setData
    const mockThis = Object.assign({}, pageDef, {
        data: { logText: '', scrollTop: 0 },
        logs: [],
        setData(o) { Object.assign(this.data, o); }
    });
    // 每条断言只面对当前 tap 的输出（日志面重置），防跨 tap 累积导致断言恒真
    const resetLog = () => {
        mockThis.logs = [];
        mockThis.data.logText = '';
    };
    for (const { tap, test, label } of TAP_ASSERTS) {
        try {
            resetLog();
            await pageDef[tap].call(mockThis);
            const r = mockThis.data.logText;
            test(r) ? ok(tap + ': ' + label) : bad(tap + ` 未通过: ${r.slice(-200)}`);
        } catch (e) {
            bad(tap + ` 异常: ${e && e.message}`);
        }
    }
    // 物理层验证：信封对象形态（Object 化后序列化归原生，库层不做 String 中间转换）
    const libRaw = map.get('lib-key');
    libRaw && typeof libRaw === 'object' && '_v' in libRaw && '_val' in libRaw
        ? ok('物理存储为信封对象（_v + _val 可见）')
        : bad('物理存储不是信封对象: ' + typeof libRaw);
}

(async () => {
    for (const sample of SAMPLES) await drive(sample);
    console.log('\n==== SAMPLES: ' + pass + ' passed, ' + fail + ' failed ====');
    process.exit(fail ? 1 : 0);
})();
