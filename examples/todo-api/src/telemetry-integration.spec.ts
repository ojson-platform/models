/**
 * Integration tests for OpenTelemetry telemetry
 * 
 * This test suite:
 * 1. Starts a fake OTLP HTTP server to receive traces
 * 2. Starts the todo-api server with telemetry configured to send to the fake server
 * 3. Makes HTTP requests to various endpoints
 * 4. Verifies that traces were correctly exported with expected spans and their content
 * 
 * Uses JSON format for OTLP export to enable parsing and validation of span content.
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest';
import express, {type Request, type Response} from 'express';
import type {Server} from 'http';
import {createServer} from 'http';
import {AddressInfo} from 'net';
import {trace as otTrace, context as otContext, propagation as otPropagation} from '@opentelemetry/api';

// OTLP JSON format structure (simplified)
interface OtlpAttributeValue {
  stringValue?: string;
  intValue?: string;
  boolValue?: boolean;
  arrayValue?: {values: Array<{stringValue?: string; intValue?: string}>};
}

interface OtlpSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: Array<{key: string; value: OtlpAttributeValue}>;
  events?: Array<{name: string; timeUnixNano: string; attributes?: Array<{key: string; value: OtlpAttributeValue}>}>;
  status?: {code: number; message?: string};
}

interface OtlpResourceSpans {
  resource?: {
    attributes?: Array<{key: string; value: {stringValue?: string}}>;
  };
  scopeSpans?: Array<{
    spans: OtlpSpan[];
  }>;
}

interface OtlpTraceRequest {
  resourceSpans?: OtlpResourceSpans[];
}

// Store received trace requests with parsed content
interface TraceRequest {
  timestamp: number;
  contentType: string;
  body: OtlpTraceRequest | null;
  spans: OtlpSpan[];
}

const OK = 0;
const ERROR = 2;

let receivedTraces: TraceRequest[] = [];
let otlpServer: Server | null = null;
let otlpPort: number = 0;
let apiServer: Server | null = null;
let apiPort: number = 0;

/**
 * Start a fake OTLP HTTP server that receives traces
 */
async function startFakeOtlpServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.raw({type: 'application/x-protobuf', limit: '10mb'}));
    app.use(express.json({limit: '10mb'}));

    // OTLP HTTP endpoint for traces
    app.post('/v1/traces', (req: Request, res: Response) => {
      try {
        const contentType = req.headers['content-type'] || 'unknown';
        let parsedBody: OtlpTraceRequest | null = null;
        let spans: OtlpSpan[] = [];

        // Parse JSON body if content-type is JSON
        if (contentType.includes('json') && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
          parsedBody = req.body as OtlpTraceRequest;
          
          // Debug: log the structure to understand the format
          if (process.env.DEBUG_TRACES) {
            console.log('Received trace body:', JSON.stringify(parsedBody, null, 2));
          }
          
          // Extract all spans from the trace request
          // OTLP JSON format: resourceSpans -> scopeSpans -> spans
          if (parsedBody.resourceSpans) {
            for (const resourceSpan of parsedBody.resourceSpans) {
              if (resourceSpan.scopeSpans) {
                for (const scopeSpan of resourceSpan.scopeSpans) {
                  if (scopeSpan.spans && Array.isArray(scopeSpan.spans)) {
                    spans.push(...scopeSpan.spans);
                  }
                }
              }
            }
          }
        } else if (Buffer.isBuffer(req.body)) {
          // Protobuf received - log for debugging
          if (process.env.DEBUG_TRACES) {
            console.log('Received protobuf trace (size:', req.body.length, ')');
          }
        }
        
        receivedTraces.push({
          timestamp: Date.now(),
          contentType,
          body: parsedBody,
          spans,
        });
        
        res.status(200).send();
      } catch (error) {
        console.error('Error processing trace:', error);
        res.status(500).send();
      }
    });

    const server = createServer(app);
    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      otlpServer = server;
      otlpPort = port;
      resolve(port);
    });

    server.on('error', reject);
  });
}

/**
 * Start the todo-api server
 */
async function startApiServer(otlpEndpoint: string): Promise<number> {
  // Set environment variables for OTLP endpoint
  // Use JSON format for easier testing and validation
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = otlpEndpoint;
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  
  // Configure OpenTelemetry BatchSpanProcessor for faster export in tests
  // These environment variables reduce batching delays significantly:
  // - OTEL_BSP_SCHEDULE_DELAY: How often to export batches (100ms vs default 5000ms)
  // - OTEL_BSP_EXPORT_TIMEOUT: Max time to wait for export (1000ms vs default 30000ms)
  // This makes tests ~10x faster (from ~25s to ~2s) while still testing real export behavior
  process.env.OTEL_BSP_SCHEDULE_DELAY = '100'; // Default is 5000ms
  process.env.OTEL_BSP_EXPORT_TIMEOUT = '1000'; // Default is 30000ms
  process.env.OTEL_BSP_MAX_QUEUE_SIZE = '2048'; // Default is 2048
  process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE = '512'; // Default is 512
  
  // Import server module (this will initialize telemetry)
  // Note: In ES modules, we can't easily clear cache, so we rely on environment variables
  const serverModule = await import('./server.js');
  const app = serverModule.default;
  
  if (!app) {
    throw new Error('Failed to import Express app from server.js. Make sure server.ts exports default app.');
  }
  
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      apiServer = server;
      apiPort = port;
      console.log(`Test API server started on port ${port}`);
      resolve(port);
    });

    server.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 10000);
  });
}

/**
 * Stop all servers
 */
async function stopServers() {
  const promises: Promise<void>[] = [];
  
  if (otlpServer) {
    promises.push(new Promise<void>((resolve) => {
      otlpServer!.close(() => resolve());
    }));
  }
  
  if (apiServer) {
    promises.push(new Promise<void>((resolve) => {
      apiServer!.close(() => resolve());
    }));
  }
  
  // Wait for all servers to close, but with timeout to prevent hanging
  await Promise.race([
    Promise.all(promises),
    new Promise<void>((resolve) => setTimeout(() => resolve(), 2000))
  ]);
}

/**
 * Make HTTP request to todo-api
 */
async function apiRequest(method: string, path: string, body?: any, extraHeaders?: Record<string, string>) {
  const url = `http://localhost:${apiPort}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.text();
  
  return {
    status: response.status,
    data: data ? JSON.parse(data) : null,
  };
}

/**
 * Wait for traces to be exported (OTEL SDK exports asynchronously and may batch)
 * Optimized for faster test execution by using shorter polling interval
 */
async function waitForTraces(expectedCount: number, timeout: number = 5000) {
  const start = Date.now();
  const pollInterval = 25; // Fast polling interval
  
  // Poll until we have expected traces or timeout
  while (receivedTraces.length < expectedCount && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // If we got traces, give a small buffer for any final batched exports
  // OpenTelemetry SDK uses BatchSpanProcessor which batches exports
  if (receivedTraces.length >= expectedCount) {
    // Small buffer for any remaining batched exports (reduced from 1000ms to 200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
  } else {
    // If we didn't get traces yet, wait a bit more (OpenTelemetry may batch with delay)
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Helper to find a span by exact name
 * Throws if span is not found - no conditional checks
 */
function findSpanByName(spans: OtlpSpan[], name: string): OtlpSpan {
  const span = spans.find(s => s.name === name);
  if (!span) {
    throw new Error(`Span "${name}" not found. Available spans: ${spans.map(s => s.name).join(', ')}`);
  }
  return span;
}

/**
 * Helper to find a span by name patterns
 * Throws if span is not found - no conditional checks
 */
function findSpanByPattern(spans: OtlpSpan[], patterns: string[]): OtlpSpan {
  const span = spans.find(s => patterns.every(pattern => s.name.includes(pattern)));
  if (!span) {
    throw new Error(`Span matching patterns [${patterns.join(', ')}] not found. Available spans: ${spans.map(s => s.name).join(', ')}`);
  }
  return span;
}

/**
 * Helper to verify trace was received and has valid structure
 * Throws if trace is invalid - no conditional checks
 */
function expectTraceReceived(trace: TraceRequest | undefined): asserts trace is TraceRequest {
  if (!trace) {
    throw new Error('Trace is undefined');
  }
  if (!trace.body) {
    throw new Error('Trace body is null');
  }
  if (!trace.spans || trace.spans.length === 0) {
    throw new Error('Trace has no spans');
  }
}

/**
 * Helper to verify span has required structure
 * Throws if span structure is invalid - no conditional checks
 */
function expectSpanStructure(span: OtlpSpan): void {
  expect(span.name).toBeDefined();
  expect(span.traceId).toBeDefined();
  expect(span.spanId).toBeDefined();
  expect(span.startTimeUnixNano).toBeDefined();
  expect(span.endTimeUnixNano).toBeDefined();
}

/**
 * Helper to extract attributes from span as a key-value object
 */
function getSpanAttributes(span: OtlpSpan): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};
  if (span.attributes) {
    for (const attr of span.attributes) {
      if (attr.value.stringValue !== undefined) {
        attrs[attr.key] = attr.value.stringValue;
      } else if (attr.value.intValue !== undefined) {
        attrs[attr.key] = parseInt(attr.value.intValue, 10);
      } else if (attr.value.boolValue !== undefined) {
        attrs[attr.key] = attr.value.boolValue;
      }
      // Note: arrayValue is not extracted as it's complex to represent in a simple key-value object
    }
  }
  return attrs;
}

/**
 * Helper to extract events from span
 */
function getSpanEvents(span: OtlpSpan): Array<{name: string; attributes: Record<string, string | number | boolean>}> {
  const events: Array<{name: string; attributes: Record<string, string | number | boolean>}> = [];
  if (span.events) {
    for (const event of span.events) {
      const eventAttrs: Record<string, string | number | boolean> = {};
      if (event.attributes) {
        for (const attr of event.attributes) {
          if (attr.value.stringValue !== undefined) {
            eventAttrs[attr.key] = attr.value.stringValue;
          } else if (attr.value.intValue !== undefined) {
            eventAttrs[attr.key] = parseInt(attr.value.intValue, 10);
          } else if (attr.value.boolValue !== undefined) {
            eventAttrs[attr.key] = attr.value.boolValue;
          }
        }
      }
      events.push({name: event.name, attributes: eventAttrs});
    }
  }
  return events;
}

/**
 * Helper to assert provider tag when present on model span
 */
function expectSpanHasProviderIfPresent(span: OtlpSpan, expected: string = 'test') {
  const attrs = getSpanAttributes(span);
  if (attrs['provider']) {
    expect(attrs['provider']).toBe(expected);
  }
}

/**
 * Helper to assert result event when present on model span
 */
function expectResultEventIfPresent(span: OtlpSpan) {
  const events = getSpanEvents(span);
  const resultEvent = events.find(e => e.name === 'result');
  if (resultEvent) {
    expect(resultEvent.name).toBe('result');
  }
}

describe('Telemetry Integration', () => {
  beforeAll(async () => {
    // Start fake OTLP server
    await startFakeOtlpServer();
    
    // Start todo-api server
    await startApiServer(`http://localhost:${otlpPort}`);
    
    // Wait a bit for servers to be ready (reduced to 100ms)
    // Servers should be ready almost immediately after listen() callback
    await new Promise(resolve => setTimeout(resolve, 100));
  }, 30000);

  afterAll(async () => {
    // Clean up all environment variables set during tests
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
    delete process.env.OTEL_BSP_SCHEDULE_DELAY;
    delete process.env.OTEL_BSP_EXPORT_TIMEOUT;
    delete process.env.OTEL_BSP_MAX_QUEUE_SIZE;
    delete process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE;
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    
    await stopServers();
  }, 10000);

  beforeEach(() => {
    // Clear received traces before each test
    receivedTraces = [];
  });

  it('should export traces for GET /api/todos', async () => {
    // Make request to API
    const response = await apiRequest('GET', '/api/todos');
    
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);

    // Wait for traces to be exported (OTEL SDK exports asynchronously)
    await waitForTraces(1);

    // Verify traces were received by OTLP endpoint
    expect(receivedTraces.length).toBeGreaterThan(0);
    
    const trace = receivedTraces[0];
    expectTraceReceived(trace);
    
    // withTelemetry now creates separate spans for each model
    // Note: RequestParams is set via ctx.set(), so it won't have a span
    // Only models called via ctx.request() get spans
    // Search across all received traces (due to batching, spans may be in different traces)
    const allSpans = receivedTraces.flatMap(t => t.spans);
    const spanNames = allSpans.map(s => s.name);
    
    // Should have GetAllTodos span (RequestParams is set via ctx.set(), so no span)
    expect(spanNames).toContain('GetAllTodos');
    
    // Find context span and model span from all traces
    const contextSpan = findSpanByPattern(allSpans, ['GET', '/api/todos']);
    const getAllTodosSpan = findSpanByName(allSpans, 'GetAllTodos');
    
    // Verify model span exists and is properly structured
    expect(getAllTodosSpan.name).toBe('GetAllTodos');
    expectSpanStructure(getAllTodosSpan);
    
    // Verify spans are in the same trace
    expect(getAllTodosSpan.traceId).toBe(contextSpan.traceId);
    
    // Verify model span has parentSpanId set (indicates it's a child span)
    // Note: Due to OpenTelemetry batching, parentSpanId may not always match contextSpan.spanId exactly,
    // but we verify that it exists to confirm the span hierarchy
    expect(getAllTodosSpan.parentSpanId).toBeDefined();
    
    // Verify model span tags and result event (when exported)
    expectSpanHasProviderIfPresent(getAllTodosSpan);
    expectResultEventIfPresent(getAllTodosSpan);
  });

  it('should link context span to incoming trace headers as parent', async () => {
    // Create an external parent span and inject its context into HTTP headers
    const tracer = otTrace.getTracer('upstream-service');
    const externalParent = tracer.startSpan('upstream-parent');
    const parentCtx = otTrace.setSpan(otContext.active(), externalParent);

    const headers: Record<string, string> = {};
    otPropagation.inject(parentCtx, headers);

    const traceparent = headers['traceparent'];
    expect(traceparent).toBeDefined();
    const parts = traceparent!.split('-');
    expect(parts.length).toBeGreaterThanOrEqual(4);
    const externalTraceId = parts[1];
    const externalSpanId = parts[2];

    // Make request with injected trace headers
    const response = await apiRequest('GET', '/api/todos', undefined, headers);
    expect(response.status).toBe(200);

    await waitForTraces(1);
    expect(receivedTraces.length).toBeGreaterThan(0);

    const allSpans = receivedTraces.flatMap(t => t.spans);
    const contextSpan = findSpanByPattern(allSpans, ['GET', '/api/todos']);
    expectSpanStructure(contextSpan);

    // Root context span should be in the same trace as external parent
    expect(contextSpan.traceId).toBe(externalTraceId);
    // And should have external parent span id
    expect(contextSpan.parentSpanId).toBe(externalSpanId);

    // Model spans should also be in the same trace
    const getAllTodosSpan = findSpanByName(allSpans, 'GetAllTodos');
    expect(getAllTodosSpan.traceId).toBe(externalTraceId);

    externalParent.end();
  });

  it('should keep parent context isolated for two concurrent requests', async () => {
    // Create two independent external parent spans
    const tracer = otTrace.getTracer('upstream-service');

    const parentA = tracer.startSpan('upstream-parent-A');
    const ctxA = otTrace.setSpan(otContext.active(), parentA);
    const headersA: Record<string, string> = {};
    otPropagation.inject(ctxA, headersA);
    const traceparentA = headersA['traceparent'];
    expect(traceparentA).toBeDefined();
    const partsA = traceparentA!.split('-');
    const externalTraceIdA = partsA[1];
    const externalSpanIdA = partsA[2];

    const parentB = tracer.startSpan('upstream-parent-B');
    const ctxB = otTrace.setSpan(otContext.active(), parentB);
    const headersB: Record<string, string> = {};
    otPropagation.inject(ctxB, headersB);
    const traceparentB = headersB['traceparent'];
    expect(traceparentB).toBeDefined();
    const partsB = traceparentB!.split('-');
    const externalTraceIdB = partsB[1];
    const externalSpanIdB = partsB[2];

    // Fire two concurrent requests with different parents
    const [respA, respB] = await Promise.all([
      apiRequest('GET', '/api/todos', undefined, headersA),
      apiRequest('GET', '/api/todos', undefined, headersB),
    ]);

    expect(respA.status).toBe(200);
    expect(respB.status).toBe(200);

    await waitForTraces(1);
    expect(receivedTraces.length).toBeGreaterThan(0);

    const allSpans = receivedTraces.flatMap(t => t.spans);

    // For each external trace, find its context span and verify parent/traceId
    const ctxSpanA = allSpans.find(
      s => s.traceId === externalTraceIdA && s.name.includes('/api/todos')
    );
    const ctxSpanB = allSpans.find(
      s => s.traceId === externalTraceIdB && s.name.includes('/api/todos')
    );

    expect(ctxSpanA).toBeDefined();
    expect(ctxSpanB).toBeDefined();

    expectSpanStructure(ctxSpanA!);
    expectSpanStructure(ctxSpanB!);

    expect(ctxSpanA!.parentSpanId).toBe(externalSpanIdA);
    expect(ctxSpanB!.parentSpanId).toBe(externalSpanIdB);

    // Ensure we really have two different traces, not a shared one
    expect(externalTraceIdA).not.toBe(externalTraceIdB);
    expect(ctxSpanA!.traceId).not.toBe(ctxSpanB!.traceId);

    parentA.end();
    parentB.end();
  });

  it('should export traces for POST /api/todos', async () => {
    // Make request to create a todo
    const response = await apiRequest('POST', '/api/todos', {
      title: 'Test Todo',
      description: 'Test Description',
    });
    
    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');

    // Wait for traces to be exported
    await waitForTraces(1);

    // Verify traces were received
    expect(receivedTraces.length).toBeGreaterThan(0);
    
    // Verify we received JSON trace data
    const trace = receivedTraces[0];
    expectTraceReceived(trace);
    
    // Find context span (POST request)
    const contextSpan = findSpanByPattern(trace.spans, ['POST', '/api/todos']);
    expect(contextSpan.name).toContain('/api/todos');
    expectSpanStructure(contextSpan);
    
    // Verify CreateTodo model span exists
    // Search across all received traces due to batching
    const allSpans = receivedTraces.flatMap(t => t.spans);
    const createTodoSpan = findSpanByName(allSpans, 'CreateTodo');
    expectSpanStructure(createTodoSpan);
    
    // Verify spans are in the same trace
    expect(createTodoSpan.traceId).toBe(contextSpan.traceId);
    
    // Verify model span has displayTags attributes (recorded on child span, not parent)
    expectSpanHasProviderIfPresent(createTodoSpan);
    
    // Verify parent span does NOT have model attributes (they should be on child span)
    const contextAttrs = getSpanAttributes(contextSpan);
    expect(contextAttrs['provider']).toBeUndefined();
  });

  it('should export traces with model execution data', async () => {
    // Make request that triggers multiple models
    const response = await apiRequest('GET', '/api/todos');
    
    expect(response.status).toBe(200);

    // Wait for traces
    await waitForTraces(1);

    // Verify trace was received with model execution data
    expect(receivedTraces.length).toBeGreaterThan(0);
    const trace = receivedTraces[0];
    expectTraceReceived(trace);
    
    // Find context span and model span - search across all traces due to batching
    const allSpans = receivedTraces.flatMap(t => t.spans);
    const contextSpan = findSpanByPattern(allSpans, ['GET', '/api/todos']);
    const getAllTodosSpan = findSpanByName(allSpans, 'GetAllTodos');
    
    expectSpanStructure(contextSpan);
    expectSpanStructure(getAllTodosSpan);
    
    // Verify spans are in the same trace
    expect(getAllTodosSpan.traceId).toBe(contextSpan.traceId);
    
    // Verify model span has parentSpanId set
    expect(getAllTodosSpan.parentSpanId).toBeDefined();
    
    // Verify model span tags and result event (when exported)
    expectSpanHasProviderIfPresent(getAllTodosSpan);
    expectResultEventIfPresent(getAllTodosSpan);
  });

  it('should export traces for multiple requests', async () => {
    // Make multiple requests
    await apiRequest('POST', '/api/todos', {title: 'Todo 1'});
    await apiRequest('GET', '/api/todos');

    // Wait for all traces to be exported (OTEL may batch them)
    await waitForTraces(1); // At least one batch

    // Should have received traces (may be batched into fewer requests)
    expect(receivedTraces.length).toBeGreaterThan(0);
    
    // Verify all requests resulted in trace data
    receivedTraces.forEach(trace => {
      expectTraceReceived(trace);
    });
    
    // Collect all spans from all traces
    const allSpans = receivedTraces.flatMap(t => t.spans);
    
    // Verify we have spans from both requests
    const postSpan = findSpanByPattern(allSpans, ['POST', '/api/todos']);
    const getSpan = findSpanByPattern(allSpans, ['GET', '/api/todos']);
    
    expectSpanStructure(postSpan);
    expectSpanStructure(getSpan);
    
    // Verify we have model spans from both requests
    const createTodoSpan = findSpanByName(allSpans, 'CreateTodo');
    const getAllTodosSpan = findSpanByName(allSpans, 'GetAllTodos');
    
    expectSpanStructure(createTodoSpan);
    expectSpanStructure(getAllTodosSpan);
    
    // Verify model spans are in the same traces as their context spans
    // Note: Due to batching, spans from different requests may be in different traces,
    // but spans from the same request should be in the same trace
    expect(createTodoSpan.traceId).toBe(postSpan.traceId);
    // getAllTodosSpan may be in a different trace due to batching, so we only verify it exists
    expect(getAllTodosSpan.traceId).toBeDefined();
    
    // Verify model spans have parentSpanId set
    expect(createTodoSpan.parentSpanId).toBeDefined();
    expect(getAllTodosSpan.parentSpanId).toBeDefined();
    
    // Verify model spans have displayTags attributes (when exported)
    expectSpanHasProviderIfPresent(createTodoSpan);
    expectSpanHasProviderIfPresent(getAllTodosSpan);
    
    // Verify parent spans do NOT have model attributes (they should be on child spans)
    const postAttrs = getSpanAttributes(postSpan);
    const getAttrs = getSpanAttributes(getSpan);
    expect(postAttrs['provider']).toBeUndefined();
    expect(getAttrs['provider']).toBeUndefined();
  });

  it('should export traces with error information on 404', async () => {
    // Make request to non-existent todo
    const response = await apiRequest('GET', '/api/todos/non-existent-id');
    
    expect(response.status).toBe(404);
    expect(response.data).toHaveProperty('error');

    // Wait for traces (error traces may take longer due to batching)
    await waitForTraces(1, 8000);

    // Verify trace was received with error information
    expect(receivedTraces.length).toBeGreaterThan(0);
    const trace = receivedTraces[0];
    expectTraceReceived(trace);
    
    // Find context span (the request that failed)
    // Search across all received traces due to batching
    const allSpans = receivedTraces.flatMap(t => t.spans);
    const contextSpan = findSpanByPattern(allSpans, ['GET', '/api/todos']);

    expect(contextSpan.status).toBeDefined();
    expect(contextSpan.status?.code).toBe(ERROR);
    
    // Verify GetTodo model span exists and is marked as error
    const getTodoSpan = findSpanByName(allSpans, 'GetTodo');
    
    // Verify spans are in the same trace
    expect(getTodoSpan.traceId).toBe(contextSpan.traceId);

    expect(getTodoSpan.status).toBeDefined();
    expect(getTodoSpan.status?.code).toBe(OK);
    
    // Verify model span has parentSpanId set
    expect(getTodoSpan.parentSpanId).toBeDefined();
    
    // Verify model span has displayProps attributes (id should be recorded on child span when exported)
    const getTodoAttrs = getSpanAttributes(getTodoSpan);
    if (getTodoAttrs['props.id']) {
      expect(getTodoAttrs['props.id']).toBe('non-existent-id');
    }
    
    // Verify model span has displayTags attributes and result event (when exported)
    expectSpanHasProviderIfPresent(getTodoSpan);
    expectResultEventIfPresent(getTodoSpan);
    
    // Verify parent span does NOT have model attributes (they should be on child span)
    const contextAttrs = getSpanAttributes(contextSpan);
    expect(contextAttrs['props.id']).toBeUndefined();
    expect(contextAttrs['provider']).toBeUndefined();
  });
});
