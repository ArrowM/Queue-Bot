import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./data/migrations",
	dbCredentials: {
		url: "./data/main.sqlite",
	},
});
