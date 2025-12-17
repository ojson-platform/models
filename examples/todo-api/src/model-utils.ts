import type {WithTelemetryConfig, WithCacheConfig} from '@ojson/models';

/**
 * Configuration for model properties (excluding displayName which is passed separately).
 * Composed from WithTelemetryConfig and WithCacheConfig types from @ojson/models.
 * Internal type used only within defineModel.
 */
type ModelConfig = WithTelemetryConfig & WithCacheConfig;

/**
 * Helper function to define a model with type checking.
 * 
 * This function ensures that:
 * 1. All model properties (displayName, displayProps, etc.) are correctly typed
 * 2. TypeScript will error if invalid values are assigned to model properties
 * 
 * @param name - The display name for the model (must be a string)
 * @param impl - The model function implementation
 * @param config - Optional configuration for telemetry and cache properties
 * 
 * @example
 * ```typescript
 * export const GetUser = defineModel(
 *   'GetUser',
 *   async function GetUser(props: {id: string}): Promise<User> {
 *     // implementation
 *   },
 *   {
 *     displayProps: '*',
 *   }
 * );
 * ```
 */
export function defineModel<
  M extends (...args: any[]) => any
>(
  name: string,
  impl: M,
  config?: ModelConfig
): M & WithTelemetryConfig & WithCacheConfig & {displayName: string} {
  Object.assign(impl, {
    displayName: name,
    ...config,
  });
  return impl as M & WithTelemetryConfig & WithCacheConfig & {displayName: string};
}

