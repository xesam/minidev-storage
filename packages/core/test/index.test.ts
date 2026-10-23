import * as core from '../src/index';
import { createStorageInstance } from '../src/instance';

describe('core 导出面', () => {
    it('导出 createStorageInstance（与实现模块同源，非同名替身）', () => {
        expect(core.createStorageInstance).toBe(createStorageInstance);
    });

    it('不导出内部实现（信封常量 / 实例等模块成员不外泄）', () => {
        expect(Object.keys(core).sort()).toEqual(['createStorageInstance']);
    });
});
