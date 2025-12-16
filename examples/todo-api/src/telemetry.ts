/**
 * OpenTelemetry SDK initialization
 * 
 * This file configures the OpenTelemetry SDK for tracing.
 * Traces can be exported to various backends (Jaeger, Zipkin, OTLP, etc.)
 * 
 * For local development, you can use Jaeger:
 * - Start Jaeger: docker run -d -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
 * - View traces: http://localhost:16686
 * 
 * By default, traces are exported to OTLP endpoint (http://localhost:4318/v1/traces).
 * You can configure the endpoint via OTEL_EXPORTER_OTLP_ENDPOINT environment variable.
 */

import {NodeSDK} from '@opentelemetry/sdk-node';

let sdkInstance: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * 
 * Sets up the SDK to export traces. The withTelemetry helper will automatically
 * create spans for all models and contexts, which will be exported via this SDK.
 * 
 * For production, you may want to add more configuration:
 * - Custom resource attributes
 * - Sampling configuration
 * - Multiple exporters
 */
export function initTelemetry() {
  // Avoid double initialization
  if (sdkInstance) {
    console.log('✅ OpenTelemetry SDK already initialized');
    return;
  }

  // Create SDK configuration
  // SDK will use default OTLP exporter if OTEL_EXPORTER_OTLP_ENDPOINT is set
  // Otherwise, traces are created but not exported (useful for testing)
  sdkInstance = new NodeSDK({
    // Default configuration - can be extended with:
    // - traceExporter: new OTLPTraceExporter({...})
    // - resource: new Resource({...})
    // - instrumentations: [...]
  });

  sdkInstance.start();
  
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    console.log('✅ OpenTelemetry SDK initialized');
    console.log('   Traces will be exported if OTEL_EXPORTER_OTLP_ENDPOINT is configured');
    console.log('   Example: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces');
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    if (sdkInstance) {
      sdkInstance.shutdown()
        .then(() => {
          if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
            console.log('✅ OpenTelemetry SDK shutdown');
          }
        })
        .catch((error) => {
          if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
            console.error('❌ Error shutting down OpenTelemetry SDK', error);
          }
        })
        .finally(() => process.exit(0));
    }
  });
}

