import { ENVELOPE_VERSION, packEnvelope, unpackEnvelope, isExpired } from '../src/envelope';

const AT = 1736016000000;

describe('packEnvelope（Object 化：返回对象，序列化交给原生）', () => {
    it('基础形态：_v + _val 恒在，无 _at / _exp 键', () => {
        const out = packEnvelope({ a: 1 }, false, undefined);
        expect(out).toEqual({ _v: ENVELOPE_VERSION, _val: { a: 1 } });
        expect(Object.keys(out)).toEqual(['_v', '_val']);
    });

    it('recordAt=true 写入 _at（Date.now）', () => {
        const spy = jest.spyOn(Date, 'now').mockReturnValue(AT);
        const out = packEnvelope('x', true, undefined);
        expect(out).toEqual({ _v: 1, _at: AT, _val: 'x' });
        spy.mockRestore();
    });

    it('expireAt 给定时写入 _exp；recordAt 缺省不写 _at', () => {
        const out = packEnvelope(1, false, 123456);
        expect(out).toEqual({ _v: 1, _exp: 123456, _val: 1 });
        expect(out).not.toHaveProperty('_at');
    });

    it('expireAt=undefined 永不过期（无 _exp 键）', () => {
        const out = packEnvelope(null, false, undefined);
        expect(out).not.toHaveProperty('_exp');
        expect(out).toEqual({ _v: 1, _val: null });
    });
});

describe('unpackEnvelope（双键即拆：_v 为数字且 _val 存在）', () => {
    it('信封对象：还原 _val 与 _exp', () => {
        const u = unpackEnvelope({ _v: 1, _at: AT, _exp: AT + 1000, _val: { a: 1 } });
        expect(u).toEqual({ kind: 'envelope', value: { a: 1 }, expireAt: AT + 1000 });
    });

    it('信封对象：_exp 缺省 / 非数字 → expireAt undefined', () => {
        expect(unpackEnvelope({ _v: 1, _val: 'x' })).toEqual({ kind: 'envelope', value: 'x', expireAt: undefined });
        expect(unpackEnvelope({ _v: 1, _exp: 'soon', _val: 'x' })).toEqual({
            kind: 'envelope',
            value: 'x',
            expireAt: undefined
        });
    });

    it('信封对象：_val 为 null / 嵌套对象 / false 均还原', () => {
        expect(unpackEnvelope({ _v: 1, _val: null })).toEqual({ kind: 'envelope', value: null, expireAt: undefined });
        expect(unpackEnvelope({ _v: 2, _val: { deep: [1, 2] } })).toEqual({
            kind: 'envelope',
            value: { deep: [1, 2] },
            expireAt: undefined
        });
        expect(unpackEnvelope({ _v: 0, _val: false })).toEqual({ kind: 'envelope', value: false, expireAt: undefined });
    });

    it('库外 String 原样返回（不 parse，含 JSON 文本不漂移）', () => {
        const text = '{"_v":1,"_val":"haha"}';
        expect(unpackEnvelope(text)).toEqual({ kind: 'foreign', value: text });
        const plain = 'hello';
        expect(unpackEnvelope(plain)).toEqual({ kind: 'foreign', value: 'hello' });
    });

    it('库外 Number / Boolean / null / undefined 原样返回', () => {
        expect(unpackEnvelope(42)).toEqual({ kind: 'foreign', value: 42 });
        expect(unpackEnvelope(true)).toEqual({ kind: 'foreign', value: true });
        expect(unpackEnvelope(null)).toEqual({ kind: 'foreign', value: null });
        expect(unpackEnvelope(undefined)).toEqual({ kind: 'foreign', value: undefined });
    });

    it('库外 Object：无 _v / _v 非数字 / _v 数字但无 _val → 原样返回', () => {
        const raw1 = { a: 1 };
        expect(unpackEnvelope(raw1)).toEqual({ kind: 'foreign', value: raw1 });
        const raw2 = { _v: '1', _val: 'x' };
        expect(unpackEnvelope(raw2)).toEqual({ kind: 'foreign', value: raw2 });
        const raw3 = { _v: 1, data: 'x' };
        expect(unpackEnvelope(raw3)).toEqual({ kind: 'foreign', value: raw3 });
    });

    it('库外数组原样返回（不扫描数组元素中的信封形态）', () => {
        const arr = [1, 2, 3];
        expect(unpackEnvelope(arr)).toEqual({ kind: 'foreign', value: arr });
        const withEnvelopeInside = [{ _v: 1, _val: 'x' }];
        expect(unpackEnvelope(withEnvelopeInside)).toEqual({ kind: 'foreign', value: withEnvelopeInside });
    });
});

describe('isExpired', () => {
    it('无 _exp（undefined）永不过期', () => {
        expect(isExpired(undefined, AT)).toBe(false);
    });

    it('expireAt 晚于 now 未过期；早于 / 等于 now 过期', () => {
        expect(isExpired(AT + 1000, AT)).toBe(false);
        expect(isExpired(AT - 1, AT)).toBe(true);
        expect(isExpired(AT, AT)).toBe(true);
    });
});
