import type {Todo} from './types';

import {defineModel} from '../model-utils';
import {todoStore} from '../data/store';

/**
 * Model for retrieving all todos
 */
export const GetAllTodos = defineModel(
  'GetAllTodos',
  function GetAllTodos(): Todo[] {
    return todoStore.getAll();
  },
  {
    schemaProps: {
      type: 'object',
      additionalProperties: false,
    },
    displayResult: '*',
    displayTags: {
      provider: 'test',
    },
  }
);

