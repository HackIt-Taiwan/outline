import HTMLtoDOCX from "html-to-docx";
import puppeteer, { Browser, PDFOptions } from "puppeteer";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import HTMLHelper from "@server/models/helpers/HTMLHelper";
import ShutdownHelper, { ShutdownOrder } from "@server/utils/ShutdownHelper";

const PDF_WAIT_TIMEOUT_MS = 15000;
const SIGNED_URL_TTL_SECONDS = 3000;

const defaultPdfOptions: PDFOptions = {
  format: "A4",
  printBackground: true,
  margin: {
    top: "20mm",
    right: "16mm",
    bottom: "20mm",
    left: "16mm",
  },
};

let browserPromise: Promise<Browser> | null = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    ShutdownHelper.add("puppeteer", ShutdownOrder.last, async () => {
      const browser = await browserPromise;
      await browser.close();
    });
  }

  return browserPromise;
};

const buildExportHtml = async (
  document: Document,
  options: { includeMermaid: boolean }
) =>
  DocumentHelper.toHTML(document, {
    centered: true,
    includeMermaid: options.includeMermaid,
    signedUrls: SIGNED_URL_TTL_SECONDS,
    baseUrl: env.URL,
  });

export const documentToDocx = async (document: Document): Promise<Buffer> => {
  const html = await buildExportHtml(document, { includeMermaid: false });
  const inlinedHtml = await HTMLHelper.inlineCSS(html);

  const docx = await HTMLtoDOCX(inlinedHtml, undefined, {
    title: document.titleWithDefault,
    creator: env.APP_NAME,
    font: "Calibri",
    fontSize: 22,
    table: {
      row: {
        cantSplit: true,
      },
    },
  });

  if (Buffer.isBuffer(docx)) {
    return docx;
  }

  if (docx instanceof ArrayBuffer) {
    return Buffer.from(docx);
  }

  if (ArrayBuffer.isView(docx)) {
    return Buffer.from(docx.buffer);
  }

  if (typeof (docx as Blob).arrayBuffer === "function") {
    return Buffer.from(await (docx as Blob).arrayBuffer());
  }

  return Buffer.from(docx as ArrayBuffer);
};

export const documentToPdf = async (document: Document): Promise<Buffer> => {
  const html = await buildExportHtml(document, { includeMermaid: true });
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    await page
      .waitForFunction("window.status === 'ready'", {
        timeout: PDF_WAIT_TIMEOUT_MS,
      })
      .catch((error) => {
        Logger.debug("utils", "PDF render timed out waiting for mermaid", {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    const imageWait = page.evaluate(() => {
      const images = Array.from(document.images);
      const fontReady = "fonts" in document ? document.fonts.ready : null;

      const imagePromises = images.map((img) => {
        if (img.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const done = () => {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        });
      });

      return Promise.allSettled(
        fontReady ? [...imagePromises, fontReady] : imagePromises
      );
    });

    const imagesTimedOut = await Promise.race([
      imageWait.then(() => false),
      page.waitForTimeout(PDF_WAIT_TIMEOUT_MS).then(() => true),
    ]);

    if (imagesTimedOut) {
      Logger.debug("utils", "PDF render timed out waiting for images");
    }

    return await page.pdf(defaultPdfOptions);
  } finally {
    await page.close();
  }
};
