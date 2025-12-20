import type {OJson} from '../types';

import {describe, it, expect} from 'vitest';

import {sign, cleanUndefined, has} from './index';

describe('sign', () => {
  it('should create deterministic signature for simple objects', () => {
    const props1: OJson = {a: '1', b: '2'};
    const props2: OJson = {b: '2', a: '1'};

    const sig1 = sign(props1);
    const sig2 = sign(props2);

    expect(sig1).toBe(sig2);
    expect(sig1).toBeTruthy();
  });

  it('should create different signatures for different values', () => {
    const props1: OJson = {a: '1', b: '2'};
    const props2: OJson = {a: '1', b: '3'};

    const sig1 = sign(props1);
    const sig2 = sign(props2);

    expect(sig1).not.toBe(sig2);
  });

  it('should handle nested objects', () => {
    const props1: OJson = {
      a: '1',
      b: {c: '2', d: '3'},
    };
    const props2: OJson = {
      a: '1',
      b: {d: '3', c: '2'},
    };

    const sig1 = sign(props1);
    const sig2 = sign(props2);

    expect(sig1).toBe(sig2);
  });
});

describe('cleanUndefined', () => {
  it('should remove undefined values from simple objects', () => {
    const props: OJson = {a: '1', b: undefined as any, c: '2'};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', c: '2'});
    expect('b' in cleaned).toBe(false);
  });

  it('should handle objects with only undefined values', () => {
    const props: OJson = {a: undefined as any, b: undefined as any};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({});
  });

  it('should handle empty objects', () => {
    const props: OJson = {};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({});
  });

  it('should handle nested objects', () => {
    const props: OJson = {
      a: '1',
      b: {c: '2', d: undefined as any},
      e: '3',
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({
      a: '1',
      b: {c: '2'},
      e: '3',
    });
  });

  it('should handle arrays with undefined values', () => {
    const props: OJson = {arr: [1, undefined as any, 2]};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({arr: [1, undefined, 2]});
  });

  it('should handle arrays with objects containing undefined', () => {
    const props: OJson = {
      arr: [
        {a: '1', b: undefined as any},
        {c: '2', d: '3'},
      ],
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({
      arr: [{a: '1'}, {c: '2', d: '3'}],
    });
  });

  it('should handle deeply nested structures', () => {
    const props: OJson = {
      a: '1',
      b: {
        c: '2',
        d: {
          e: undefined as any,
          f: '3',
        },
      },
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({
      a: '1',
      b: {
        c: '2',
        d: {
          f: '3',
        },
      },
    });
  });

  it('should handle arrays nested in objects', () => {
    const props: OJson = {
      items: [
        {id: 1, name: 'Item 1', description: undefined as any},
        {id: 2, name: 'Item 2'},
      ],
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({
      items: [
        {id: 1, name: 'Item 1'},
        {id: 2, name: 'Item 2'},
      ],
    });
  });

  it('should preserve null values', () => {
    const props: OJson = {a: '1', b: null, c: '2'};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', b: null, c: '2'});
  });

  it('should preserve false values', () => {
    const props: OJson = {a: '1', b: false, c: '2'};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', b: false, c: '2'});
  });

  it('should preserve zero values', () => {
    const props: OJson = {a: '1', b: 0, c: '2'};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', b: 0, c: '2'});
  });

  it('should preserve empty strings', () => {
    const props: OJson = {a: '1', b: '', c: '2'};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', b: '', c: '2'});
  });

  it('should handle objects that become empty after cleaning', () => {
    const props: OJson = {
      a: '1',
      nested: {b: undefined as any, c: undefined as any},
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1', nested: {}});
  });

  it('should handle nested arrays with objects', () => {
    const props: OJson = {
      data: [
        [
          {x: 1, y: undefined as any},
          {x: 2, y: 3},
        ],
        [{x: 4, y: 5}],
      ],
    };
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({
      data: [[{x: 1}, {x: 2, y: 3}], [{x: 4, y: 5}]],
    });
  });

  it('should not modify the original object', () => {
    const props: OJson = {a: '1', b: undefined as any};
    const cleaned = cleanUndefined(props);

    expect(props).toEqual({a: '1', b: undefined});
    expect(cleaned).toEqual({a: '1'});
  });

  it('should handle optional properties set to undefined', () => {
    interface Props {
      a: string;
      b?: string;
    }
    const props: Props = {a: '1', b: undefined};
    const cleaned = cleanUndefined(props);

    expect(cleaned).toEqual({a: '1'});
    // This is the key behavior: models should not be able to detect
    // optional properties that were set to undefined
    if ('b' in cleaned) {
      // This should not execute
      throw new Error('Optional property should not be present');
    }
  });
});

describe('has', () => {
  it('should return true if object has property', () => {
    const obj = {a: 1, b: 'test'};
    expect(has(obj, 'a')).toBe(true);
    expect(has(obj, 'b')).toBe(true);
  });

  it('should return false if object does not have property', () => {
    const obj = {a: 1};
    expect(has(obj, 'b')).toBe(false);
    expect(has(obj, 'c')).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(has(null, 'a')).toBe(false);
    expect(has(undefined, 'a')).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(has(123, 'a')).toBe(false);
    expect(has('string', 'a')).toBe(false);
    expect(has(true, 'a')).toBe(false);
  });

  it('should check type when type parameter is provided', () => {
    const obj = {func: () => {}, num: 42, str: 'test', obj: {}};
    expect(has(obj, 'func', 'function')).toBe(true);
    expect(has(obj, 'num', 'number')).toBe(true);
    expect(has(obj, 'str', 'string')).toBe(true);
    expect(has(obj, 'obj', 'object')).toBe(true);
  });

  it('should return false if property exists but type does not match', () => {
    const obj = {num: 42, str: 'test'};
    expect(has(obj, 'num', 'string')).toBe(false);
    expect(has(obj, 'str', 'number')).toBe(false);
    expect(has(obj, 'num', 'function')).toBe(false);
  });

  it('should work with symbols', () => {
    const sym = Symbol('test');
    const obj = {[sym]: 'value'};
    expect(has(obj, sym)).toBe(true);
    expect(has(obj, sym, 'string')).toBe(true);
    expect(has(obj, sym, 'number')).toBe(false);
  });

  it('should work with inherited properties', () => {
    class Parent {
      parentProp = 'parent';
    }
    class Child extends Parent {
      childProp = 'child';
    }
    const obj = new Child();
    expect(has(obj, 'parentProp')).toBe(true);
    expect(has(obj, 'childProp')).toBe(true);
  });
});
