import type { Metric } from 'web-vitals';

const COLLECTOR_URL = process.env.NEXT_PUBLIC_OTEL_COLLECTOR_URL;
const TARGET_ENV = process.env.NEXT_PUBLIC_TARGET_ENV || '';
// Must resolve the same way as instrumentation-client.ts, or Web Vitals land
// under a different service.name than the rest of the browser telemetry.
const SERVICE_NAME =
  process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'ragen-web-client';

function sendMetric(metric: Metric) {
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
  if (!COLLECTOR_URL) {
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
