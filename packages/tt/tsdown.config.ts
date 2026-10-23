import { defineConfig } from 'tsdown';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolveDeps } from '../../scripts/build-deps.cjs';

// 单入口 index，dual cjs+esm。@mini-dev/storage 为普通依赖（workspace:*），构建时外置
// require('@mini-dev/storage')，不内联打包，便于按平台独立发布。
// cjs pass 在 onSuccess 把 main 与 dependencies（协议解析为实版本）
// 透传进 dist/cjs/package.json，让小程序「构建 npm」运行时能跨包 require 到 @mini-dev/storage。
export default defineConfig([
    {
        entry: { index: 'src/index.ts' },
        format: ['cjs'],
        target: 'es2015',
        outDir: 'dist/cjs',
        outExtensions: () => ({ js: '.js' }),
        hash: false,
        dts: { sourcemap: true },
        sourcemap: true,
        clean: false,
        onSuccess: async () => {
            const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
            writeFileSync(
                'dist/cjs/package.json',
                JSON.stringify(
                    { type: 'commonjs', main: 'index.js', dependencies: resolveDeps(pkg.dependencies, import.meta.url) },
                    null,
                    2
                ) + '\n'
            );
        }
    },
    {
        entry: { index: 'src/index.ts' },
        format: ['esm'],
        target: 'es2015',
        outDir: 'dist/esm',
        outExtensions: () => ({ js: '.js' }),
        hash: false,
        dts: { sourcemap: true },
        sourcemap: true,
        clean: false,
        onSuccess: async () => {
            writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
        }
    }
]);
