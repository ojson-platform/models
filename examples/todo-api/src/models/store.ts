import type {Todo} from './types';

// In-memory хранилище для todo-lists
class TodoStore {
  private todos: Map<string, Todo> = new Map();
  private nextId = 1;

  getAll(): Todo[] {
    return Array.from(this.todos.values());
  }

  getById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Todo {
    const id = String(this.nextId++);
    const now = Date.now();
    const newTodo: Todo = {
      ...todo,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.todos.set(id, newTodo);
    return newTodo;
  }

  update(id: string, updates: Partial<Omit<Todo, 'id' | 'createdAt'>>): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) {
      return undefined;
    }
    const updated: Todo = {
      ...todo,
      ...updates,
      updatedAt: Date.now(),
    };
    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }
}

export const todoStore = new TodoStore();

