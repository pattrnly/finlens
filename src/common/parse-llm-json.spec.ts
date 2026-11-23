import { parseLlmJson } from './parse-llm-json';

describe('parseLlmJson', () => {
  it('reads fenced JSON', () => {
    expect(parseLlmJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('repairs trailing commas and unquoted keys', () => {
    const raw = `{rows:[{i:0,type:"expense",merchant:"IDFC UPI",},],}`;
    expect(parseLlmJson(raw)).toEqual({
      rows: [{ i: 0, type: 'expense', merchant: 'IDFC UPI' }],
    });
  });

  it('salvages complete rows when the model truncates the array', () => {
    const raw = `{"rows":[{"i":0,"type":"expense","merchant":"A"},{"i":1,"type":"income","merchant":"B"},{"i":2,"type":`;
    const parsed = parseLlmJson<{ rows: Array<{ i: number }> }>(raw);
    expect(parsed.rows.map((r) => r.i)).toEqual([0, 1]);
  });
});
