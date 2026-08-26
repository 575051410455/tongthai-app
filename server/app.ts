import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { csrfCheck } from "./lib/cookies";
import { generalLimiter } from "./middleware/rate-limit";
import { expensesRoute } from "./routes/expenses";
import { authRoute } from "./routes/auth";

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", generalLimiter);
// Fail-closed double-submit CSRF for every cookie-authenticated unsafe request
app.use("/api/*", csrfCheck);

const apiRoutes = app
  .basePath("/api")
  .route("/expenses", expensesRoute)
  .route("/auth", authRoute);

// Unmatched /api paths must 404 as JSON — never fall through to the SPA
// fallback below, which would answer 200 text/html.
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.get("*", serveStatic({ root: "./frontend/dist" }));
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

export default app;
export type ApiRoutes = typeof apiRoutes