import 'reflect-metadata';
import { container as defaultContainer } from 'tsyringe';
import { describe, expect, it } from 'vitest';
import { registerDependencies, type InjectionObject } from '@common/dependencyRegistration';

describe('registerDependencies', () => {
  it('registers every dependency onto the default container when useChild is omitted', () => {
    const token = Symbol('plain-value');
    const dependencies: InjectionObject<unknown>[] = [{ token, provider: { useValue: 'plain' } }];

    const container = registerDependencies(dependencies);

    expect(container).toBe(defaultContainer);
    expect(container.resolve(token)).toBe('plain');
  });

  it('registers onto an isolated child container when useChild is true', () => {
    const token = Symbol('child-value');
    const dependencies: InjectionObject<unknown>[] = [{ token, provider: { useValue: 'child' } }];

    const container = registerDependencies(dependencies, undefined, true);

    expect(container).not.toBe(defaultContainer);
    expect(container.resolve(token)).toBe('child');
    expect(() => defaultContainer.resolve(token)).toThrow();
  });

  it('uses the override provider instead of the original for a matching token', () => {
    const token = Symbol('overridden-value');
    const dependencies: InjectionObject<unknown>[] = [{ token, provider: { useValue: 'original' } }];
    const override: InjectionObject<unknown>[] = [{ token, provider: { useValue: 'overridden' } }];

    const container = registerDependencies(dependencies, override, true);

    expect(container.resolve(token)).toBe('overridden');
  });

  it('additionally registers an override token that was not in the original dependency list', () => {
    const originalToken = Symbol('kept-value');
    const extraToken = Symbol('extra-value');
    const dependencies: InjectionObject<unknown>[] = [{ token: originalToken, provider: { useValue: 'kept' } }];
    const override: InjectionObject<unknown>[] = [{ token: extraToken, provider: { useValue: 'extra' } }];

    const container = registerDependencies(dependencies, override, true);

    expect(container.resolve(originalToken)).toBe('kept');
    expect(container.resolve(extraToken)).toBe('extra');
  });
});
