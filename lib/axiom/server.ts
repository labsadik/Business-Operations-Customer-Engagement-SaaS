import { Axiom } from "@axiomhq/js";
import {
  AxiomJSTransport,
  ConsoleTransport,
  Logger
} from "@axiomhq/logging";
import { nextJsFormatters } from "@axiomhq/nextjs";

const axiomToken = process.env.AXIOM_TOKEN?.trim();
const axiomDataset = process.env.AXIOM_DATASET?.trim();

export const logger =
  axiomToken && axiomDataset
    ? new Logger({
        transports: [
          new AxiomJSTransport({
            axiom: new Axiom({
              token: axiomToken,
              axiomClient: "conventus"
            }),
            dataset: axiomDataset
          }),
          new ConsoleTransport({ prettyPrint: true })
        ],
        formatters: nextJsFormatters
      })
    : new Logger({
        transports: [new ConsoleTransport({ prettyPrint: true })],
        formatters: nextJsFormatters
      });
