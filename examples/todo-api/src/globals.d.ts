/**
 * Global type declarations for todo-api
 * 
 * Extends the base Model type to include telemetry and cache configuration properties.
 * This allows TypeScript to know about displayProps, displayResult, displayTags, and cacheStrategy
 * when defining models.
 */

declare global {
  import type {Model as BaseModel, WithTelemetryConfig, WithCacheConfig} from '@ojson/models';
  
  /**
   * Extended Model type that includes telemetry and cache configuration.
   * When using this type, TypeScript will know about displayProps, displayResult,
   * displayTags, and cacheStrategy properties.
   */
  type Model = WithCacheConfig & WithTelemetryConfig & BaseModel;
}

export {};

