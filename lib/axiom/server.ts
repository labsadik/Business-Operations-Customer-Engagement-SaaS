import { Axiom } from "@axiomhq/js";
import {
  AxiomJSTransport,
  ConsoleTransport,
  Logger
} from "@axiomhq/logging";
import {
  createAxiomRouteHandler,
  nextJsFormatters
} from "@axiomhq/nextjs";

const axiomToken = process.env.AXIOM_TOKEN?.trim();
const axiomDataset = process.env.AXIOM_DATASET?.trim();

const transports = [
  new ConsoleTransport({ prettyPrint: true })
];

if (axiomToken && axiomDataset) {
  const axiom = new Axiom({
    token: axiomToken,
    axiomClient: "conventus"
  });

  transports.unshift(
    new AxiomJSTransport({
      axiom,
      dataset: axiomDataset
    })
  );
}

export const logger = new Logger({
  transports,
  formatters: nextJsFormatters
});

export const withAxiom = createAxiomRouteHandler(logger);
