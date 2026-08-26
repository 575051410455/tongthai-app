import app from "./app";
import { z } from "zod";

const ServeEnv = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/, "Port must be a numeric string")
    .default("3000")
    .transform(Number),
});
const ProcessEnv = ServeEnv.parse(process.env);

const server = Bun.serve({
  port: ProcessEnv.PORT,
  hostname: "0.0.0.0",
  // Pass the socket peer address into Hono's env so clientIp() can resolve
  // the real client without ever blindly trusting X-Forwarded-For.
  fetch: (req, srv) => app.fetch(req, { ip: srv.requestIP(req) }),
});

console.log("server running", server.port);
