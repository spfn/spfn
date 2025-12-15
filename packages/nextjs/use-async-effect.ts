// import { useEffect, useRef, useCallback, type DependencyList } from "react";
//
// type AsyncEffectCallback = (signal: AbortSignal) => Promise<void>;
//
// /**
//  * useEffect for async functions with AbortSignal support.
//  *
//  * @example
//  * useAsyncEffect(async (signal) => {
//  *     const data = await fetch("/api/data", { signal });
//  *     if (!signal.aborted) {
//  *         setData(data);
//  *     }
//  * }, [dependency]);
//  */
// export function useAsyncEffect(
//     effect: AsyncEffectCallback,
//     deps: DependencyList
// ): void
// {
//     useEffect(() =>
//     {
//         const controller = new AbortController();
//
//         effect(controller.signal).catch((error) =>
//         {
//             if (error.name !== "AbortError")
//             {
//                 console.error("useAsyncEffect error:", error);
//             }
//         });
//
//         return () => controller.abort();
//     }, deps);
// }
//
// interface UseAsyncCallbackOptions
// {
//     onError?: (error: Error) => void;
// }
//
// interface UseAsyncCallbackReturn<T extends unknown[]>
// {
//     execute: (...args: T) => Promise<void>;
//     isLoading: boolean;
// }
//
// /**
//  * useCallback for async functions with loading state.
//  *
//  * @example
//  * const { execute: fetchData, isLoading } = useAsyncCallback(
//  *     async (id: string) => {
//  *         const data = await api.getData(id);
//  *         setData(data);
//  *     },
//  *     [setData]
//  * );
//  */
// export function useAsyncCallback<T extends unknown[]>(
//     callback: (...args: T) => Promise<void>,
//     deps: DependencyList,
//     options?: UseAsyncCallbackOptions
// ): UseAsyncCallbackReturn<T>
// {
//     const loadingRef = useRef(false);
//     const mountedRef = useRef(true);
//
//     useEffect(() =>
//     {
//         mountedRef.current = true;
//         return () =>
//         {
//             mountedRef.current = false;
//         };
//     }, []);
//
//     const execute = useCallback(async (...args: T) =>
//     {
//         if (loadingRef.current)
//         {
//             return;
//         }
//
//         loadingRef.current = true;
//
//         try
//         {
//             await callback(...args);
//         }
//         catch (error)
//         {
//             if (mountedRef.current)
//             {
//                 options?.onError?.(error as Error);
//             }
//         }
//         finally
//         {
//             if (mountedRef.current)
//             {
//                 loadingRef.current = false;
//             }
//         }
//     }, deps);
//
//     return {
//         execute,
//         get isLoading()
//         {
//             return loadingRef.current;
//         },
//     };
// }
