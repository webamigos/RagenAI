import { publicRuntimeConfig } from '@/config/public-runtime-config';
import type { Metric } from 'web-vitals';

/**
 * Read per call, not once at module load.
 *
 * These were module constants, which is the shape that stops working when the
 * values come from the document rather than from the bundle: this module is
 * imported while the page is still assembling, and a constant would capture
 * whatever was readable at that instant. `publicRuntimeConfig()` caches after
 * the first successful read, so the cost of asking again is a property lookup.
 *
 * `serviceName` must resolve the same way as `instrumentation-client.ts`, or
 * Web Vitals land under a different `service.name` than the rest of the
 * browser telemetry.
 */
function telemetryConfig() {
  const config = publicRuntimeConfig();
  return {
    collectorUrl: config.otelCollectorUrl,
    targetEnv: config.targetEnv,
    serviceName: config.otelServiceName || 'ragen-web-client',
  };
}

function sendMetric(metric: Metric) {
  const {
    collectorUrl: COLLECTOR_URL,
    targetEnv: TARGET_ENV,
    serviceName: SERVICE_NAME,
  } = telemetryConfig();

  if (!COLLECTOR_URL) {
    return;
  }

  const resourceAttributes = [
    { key: 'service.name', value: { stringValue: SERVICE_NAME } },
  ];
  if (TARGET_ENV) {
    resourceAttributes.push({
      key: 'deployment.environment.name',
      value: { stringValue: TARGET_ENV },
    });
  }

  const body = JSON.stringify({
    resourceMetrics: [
      {
        resource: { attributes: resourceAttributes },
        scopeMetrics: [
          {
            scope: { name: 'web-vitals' },
            metrics: [
              {
                name: `web_vitals.${metric.name.toLowerCase()}`,
                unit: '',
                gauge: {
                  dataPoints: [
                    {
                      asDouble: metric.value,
                      timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
                      attributes: [
                        {
                          key: 'web_vitals.id',
                          value: { stringValue: metric.id },
                        },
                        {
                          key: 'web_vitals.rating',
                          value: { stringValue: metric.rating },
                        },
                        {
                          key: 'page.url',
                          value: { stringValue: window.location.pathname },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  const url = `${COLLECTOR_URL}/v1/metrics`;

  if (typeof navigator.sendBeacon === 'function') {
    const sent = navigator.sendBeacon(
      url,
      new Blob([body], { type: 'application/json' }),
    );
    if (!sent) {
      fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
  } else {
    fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }
}

export function initWebVitals() {
  if (!telemetryConfig().collectorUrl) {
    return;
  }

  import('web-vitals').then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
    onLCP(sendMetric);
    onCLS(sendMetric);
    onINP(sendMetric);
    onFCP(sendMetric);
    onTTFB(sendMetric);
  });
}
