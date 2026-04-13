import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      ok: true,
      service: "flyhub-api",
      timestamp: new Date().toISOString(),
    };
  });
}