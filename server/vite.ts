import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";

export { log } from "./logger";

export async function setupVite(app: Express, server: Server) {
  console.log("[vite] setup start");
  const { createServer: createViteServer, createLogger } = await import("vite");
  console.log("[vite] module imported");
  const viteConfig = (await import("../vite.config")).default;
  const { nanoid } = await import("nanoid");
  const logger = createLogger();

  console.log("[vite] creating Vite server");
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...logger,
      error: (msg, options) => {
        logger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: false,
      allowedHosts: true as const,
    },
    appType: "custom",
  });
  console.log("[vite] Vite server created");

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    console.log(`[vite] html middleware start: ${url}`);

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      console.log("[vite] index.html read");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      console.log("[vite] index transformed, sending");
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      console.error("[vite] html middleware error:", e);
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
