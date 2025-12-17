import {describe, it, expect} from 'vitest';
import type {OJson} from '../types';

import {sign} from './index';

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
        const props1: OJson = {a: '1', nested: {b: '2', c: '3'}};
        const props2: OJson = {nested: {c: '3', b: '2'}, a: '1'};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should handle arrays', () => {
        const props1: OJson = {items: ['a', 'b', 'c']};
        const props2: OJson = {items: ['a', 'b', 'c']};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should handle numbers', () => {
        const props1: OJson = {count: 42};
        const props2: OJson = {count: 42};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should handle booleans', () => {
        const props1: OJson = {enabled: true, disabled: false};
        const props2: OJson = {disabled: false, enabled: true};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should handle null', () => {
        const props1: OJson = {value: null};
        const props2: OJson = {value: null};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should skip undefined values (Object.keys behavior)', () => {
        // Object.keys() doesn't include properties with undefined values
        // This means undefined values are effectively ignored in signatures
        const props1: OJson = {a: '1', b: undefined as any};
        const props2: OJson = {a: '1'};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        // Both should produce the same signature because undefined is skipped
        expect(sig1).toBe(sig2);
    });

    it('should skip properties explicitly set to undefined via Object.defineProperty', () => {
        // Even if we explicitly set a property to undefined, sign() should skip it
        const props1: OJson = {a: '1'};
        Object.defineProperty(props1, 'b', {value: undefined, enumerable: true});
        
        const props2: OJson = {a: '1'};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        // sign() explicitly skips undefined values, so signatures should be the same
        expect(sig1).toBe(sig2);
        expect(sig1).not.toContain('b=undefined');
    });

    it('should handle circular references', () => {
        const props1: OJson = {a: '1'};
        (props1 as any).circular = props1;
        
        // Should not throw and should skip circular reference
        const sig1 = sign(props1);
        expect(sig1).toBeTruthy();
        expect(sig1).toContain('a=1');
    });

    it('should create consistent signatures for objects with optional properties', () => {
        // Simulating optional properties: when property is not present vs when it's undefined
        // This is important for memoization - objects with missing optional properties
        // should have the same signature as objects with optional properties set to undefined
        const props1: OJson = {title: 'test'};
        const props2: OJson = {title: 'test', description: undefined as any};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        // Both should produce the same signature because sign() explicitly skips undefined
        // This ensures consistent memoization keys for models with optional properties
        expect(sig1).toBe(sig2);
        expect(sig1).toBe('title=test');
    });

    it('should handle multiple optional properties with undefined values', () => {
        const props1: OJson = {title: 'test', id: '123'};
        const props2: OJson = {title: 'test', id: '123', description: undefined as any, tags: undefined as any};
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        // Should produce the same signature regardless of undefined optional properties
        expect(sig1).toBe(sig2);
    });

    it('should handle empty objects', () => {
        const props: OJson = {};
        const sig = sign(props);
        
        expect(sig).toBe('');
    });

    it('should handle deeply nested structures', () => {
        const props1: OJson = {
            level1: {
                level2: {
                    level3: {
                        value: 'deep'
                    }
                }
            }
        };
        const props2: OJson = {
            level1: {
                level2: {
                    level3: {
                        value: 'deep'
                    }
                }
            }
        };
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });

    it('should handle mixed types in nested objects', () => {
        const props1: OJson = {
            string: 'text',
            number: 42,
            boolean: true,
            nullValue: null,
            array: [1, 2, 3],
            nested: {
                key: 'value'
            }
        };
        const props2: OJson = {
            nested: {key: 'value'},
            array: [1, 2, 3],
            nullValue: null,
            boolean: true,
            number: 42,
            string: 'text'
        };
        
        const sig1 = sign(props1);
        const sig2 = sign(props2);
        
        expect(sig1).toBe(sig2);
    });
});

