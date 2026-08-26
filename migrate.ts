import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// for migrations
const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
console.log("migration complete");
// Without this the open connection keeps the event loop alive forever
await migrationClient.end();