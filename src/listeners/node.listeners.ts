import { flushPendingGuildUpdatesToDB } from "../db/db-scheduled-tasks.ts";

export namespace NodeListeners {
	// Load signal handlers for graceful shutdown with error logging
	export function load() {
		process.on("SIGINT", async () => {
			try {
				await flushPendingGuildUpdatesToDB();
				process.exit(0);
			}
			catch (error) {
				await handleExitWithError(error);
			}
		});

		process.on("SIGTERM", async () => {
			try {
				await flushPendingGuildUpdatesToDB();
				process.exit(0);
			}
			catch (error) {
				await handleExitWithError(error);
			}
		});

		process.on("uncaughtException", async (error) => {
			console.error(`Error occurred: ${error}`);
			if (error.stack) {
				console.error(error.stack);
			}
		});

		process.on("unhandledRejection", async (reason, promise) => {
			console.error(`Unhandled Rejection: ${reason}`);
			// Optionally, log the stack trace of the promise rejection
			promise.catch((error) => {
				console.error(error);
				if (error.stack) {
					console.error(error.stack);
				}
			});
		});
	}

	async function handleExitWithError(error?: Error | any) {
		if (error) {
			console.error(`Error occurred: ${error}`);
			if (error.stack) {
				console.error(error.stack);
			}
		}
		try {
			await flushPendingGuildUpdatesToDB();
		}
		catch (err) {
			console.error(`Error flushing pending updates to DB: ${err}`);
		}
		process.exit(1);
	}
}