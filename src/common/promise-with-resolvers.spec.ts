import './promise-with-resolvers';

type PromiseWithResolversCtor = PromiseConstructor & {
  withResolvers: <T = unknown>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

describe('Promise.withResolvers polyfill', () => {
  it('resolves a deferred promise', async () => {
    const PromiseCtor = Promise as PromiseWithResolversCtor;
    expect(typeof PromiseCtor.withResolvers).toBe('function');
    const { promise, resolve } = PromiseCtor.withResolvers<number>();
    resolve(7);
    await expect(promise).resolves.toBe(7);
  });
});
