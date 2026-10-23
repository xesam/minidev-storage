// 把 package.json dependencies 中的 workspace: / catalog: 协议解析为已安装实际版本的
// caret 区间，供各包 tsdown.config.ts 写入发布产物 dist/cjs/package.json。
// 小程序「构建 npm」运行时按包自身 dependencies 放行跨包 require；workspace:/catalog:
// 原样写进产物会在发布后无法解析（pnpm 只改写包根 package.json，不改 dist 内的文件）。
//
// `fromFile` 传调用方 tsdown.config.ts 的 URL（import.meta.url），使 createRequire 从该包
// 目录解析依赖，命中本包 node_modules 里的软链/实包。
const { createRequire } = require('node:module');

function resolveDeps(deps, fromFile) {
    const req = createRequire(fromFile);
    const out = {};
    for (const [name, range] of Object.entries(deps || {})) {
        if (typeof range !== 'string') continue;
        if (range.startsWith('workspace:') || range.startsWith('catalog:')) {
            out[name] = '^' + req(name + '/package.json').version;
        } else {
            out[name] = range;
        }
    }
    return out;
}

module.exports = { resolveDeps };
