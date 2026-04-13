import { buildApp } from "./app.js";

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT || 3333);

  try {
    await app.listen({
      port,
      host: "0.0.0.0",
    });

    app.log.info(`HTTP server running on port ${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();