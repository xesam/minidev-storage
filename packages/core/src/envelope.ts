/**
 * 信封（2026-10-23 Object 化修订）：库写的物理数据统一为信封对象
 * `{ _v, _at?, _exp?, _val }`。**序列化交给原生存储层**——原生支持直接存 Object、
 * 读回自动还原，库不做 Object↔String 中间转换（旧版在此处手写 JSON.stringify，
 * 与原生序列化叠加成双重转换：`_val` 内容双重转义致字节膨胀、Storage 面板不可读，
 * 2026-10-23 修订废弃）。
 *
 * - `_v` / `_val` 恒在；`_at` 由实例配置 recordAt 控制；`_exp` 按 TTL 有无；
 * - 判定「双键即拆」：值为对象且 `_v` 为数字且 `_val` 存在即认信封，
 *   **不比较版本号**——未来格式演进只做加字段式兼容变更，破坏性变更换键名；
 * - 非信封结果（库外原生写入的任何值）一律原样返回，无 parse、无形状漂移特规。
 */

export const ENVELOPE_VERSION = 1;

export type Unpacked =
    | { kind: 'envelope'; value: unknown; expireAt: number | undefined }
    | { kind: 'foreign'; value: unknown };

function isEnvelopeShape(stored: unknown): stored is Record<string, unknown> {
    if (typeof stored !== 'object' || stored === null) {
        return false;
    }
    const record = stored as Record<string, unknown>;
    return typeof record._v === 'number' && '_val' in record;
}

/** 值装信封。expireAt 为 undefined 即永不过期（无 _exp 键）。返回普通对象，序列化由原生负责。 */
export function packEnvelope(value: unknown, recordAt: boolean, expireAt: number | undefined): Record<string, unknown> {
    const envelope: Record<string, unknown> = { _v: ENVELOPE_VERSION, _val: value };
    if (recordAt) {
        envelope._at = Date.now();
    }
    if (expireAt !== undefined) {
        envelope._exp = expireAt;
    }
    return envelope;
}

/** 对原生读到的值做信封判定。foreign 分支 value 保持原样原值。 */
export function unpackEnvelope(stored: unknown): Unpacked {
    if (isEnvelopeShape(stored)) {
        const record = stored as Record<string, unknown>;
        const exp = record._exp;
        return { kind: 'envelope', value: record._val, expireAt: typeof exp === 'number' ? exp : undefined };
    }
    return { kind: 'foreign', value: stored };
}

/** 过期判定：有 _exp 且 expireAt <= now。 */
export function isExpired(expireAt: number | undefined, now: number): boolean {
    return expireAt !== undefined && expireAt <= now;
}
