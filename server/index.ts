import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { log } from "./logger";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Prevent caching of error responses (4xx/5xx) so a one-time 403 doesn't stick in the browser
app.use((req, res, next) => {
  const originalStatus = res.status.bind(res);
  res.status = function (code: number) {
    const result = originalStatus(code);
    if (code >= 400) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    return result;
  };
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Static imports run before this line; `./routes` and `./prerender` are dynamic so you see logs while large graphs load.
  console.log("[server] starting…");
  console.log("[server] loading routes module (first run can take 10–30s)…");
  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Prerender middleware for SEO bots (before Vite/static serving)
  const { prerenderMiddleware } = await import("./prerender");
  app.use(prerenderMiddleware);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    console.log("[server] loading Vite dev server…");
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
    console.log("[server] Vite ready");
  } else {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // On macOS, reusePort is not supported with 0.0.0.0, so we use it conditionally
  const isMacOS = process.platform === 'darwin';
  const listenOptions: any = {
    port,
    host: isMacOS ? "127.0.0.1" : "0.0.0.0",
  };
  
  // reusePort is only supported on Linux and not needed on macOS
  if (!isMacOS) {
    listenOptions.reusePort = true;
  }

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${port} is already in use. Stop the other process (e.g. Docker: docker compose -f docker-compose.dev.yml down) or set PORT=5000 in .env`,
      );
    } else {
      console.error("[server] listen error:", err);
    }
    process.exit(1);
  });

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
