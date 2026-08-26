import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { auth } from "./lib/auth";
import { originCheck } from "./middleware/origin-check";
import { generalLimiter } from "./middleware/rate-limit";
import { expensesRoute } from "./routes/expenses";

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", generalLimiter);
// Foreign-origin unsafe requests are rejected outright (the CSRF posture
// that replaced the retired double-submit token)
app.use("/api/*", originCheck);

// better-auth owns the entire /api/auth surface (ADR 0001). It is a raw
// fetch handler, so these endpoints are NOT part of the Hono RPC type —
// the typed better-auth client is the frontend's interface to them.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const apiRoutes = app.basePath("/api").route("/expenses", expensesRoute);

// Unmatched /api paths must 404 as JSON — never fall through to the SPA
// fallback below, which would answer 200 text/html.
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.get("*", serveStatic({ root: "./frontend/dist" }));
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

export default app;
export type ApiRoutes = typeof apiRoutes;
