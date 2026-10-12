import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";

const axiomHost = process.env.AXIOM_HOST?.trim().replace(/\/+$/, "");
const axiomToken = process.env.AXIOM_TOKEN?.trim();
const axiomDataset = process.env.AXIOM_DATASET?.trim();
const serviceName =
  process.env.AXIOM_SERVICE_NAME?.trim() || "canvas";

if (!axiomHost || !axiomToken || !axiomDataset) {
  console.warn(
    "[Axiom] AXIOM_HOST, AXIOM_TOKEN, and AXIOM_DATASET are not configured; OpenTelemetry export is disabled."
  );
} else {
  const exporter = new OTLPTraceExporter({
    url: axiomHost + "/v1/traces",
    headers: {
      Authorization: "Bearer " + axiomToken,
      "X-Axiom-Dataset": axiomDataset
    }
  });

  const sdk = new NodeSDK({
    serviceName,
    resource: resourceFromAttributes({
      "service.name": serviceName,
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
      "axiom.dataset": axiomDataset
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": {
          enabled: false
        }
      })
    ]
  });

  sdk.start();
}
