import type {OJson, Json} from '@ojson/models';
import {defineModel} from '../model-utils';

// Тип для параметров запроса Express (расширяет OJson для совместимости)
export interface ExpressRequestParams extends OJson {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Json;
}

/**
 * Model for retrieving request parameters from Express
 * 
 * This model should not be called directly - its value is set via ctx.set() in middleware.
 */
export const RequestParams = defineModel(
  'RequestParams',
  function RequestParams(): ExpressRequestParams {
    throw new Error('RequestParams should be set via ctx.set() in middleware');
  }
);

