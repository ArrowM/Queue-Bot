import { REST, ShardingManager } from "discord.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Get the directory of this file for resolving paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to your renamed shard file
const shardFile = join(__dirname, "shard.ts");

// Function to calculate shard count based on guild count
async function calculateShardCount() {
	// Make sure we have a token
	const token = process.env.TOKEN;
	if (!token) {
		console.error("Discord token not found in environment variables");
		return "auto";
	}

	// Create REST instance to make API calls
	const rest = new REST({ version: "10" }).setToken(token);

	try {
		// Get guilds data from Discord API
		const guildsData = await rest.get("/users/@me/guilds") as any[];

		// Calculate total guilds
		const guildCount = guildsData.length;
		console.log(`Bot is in ${guildCount} guilds`);

		// Calculate shard count (1 shard per 1500 guilds)
		const shardCount = Math.max(1, Math.ceil(guildCount / 1500));
		console.log(`Using ${shardCount} shards (1 per 1500 guilds)`);
		return shardCount;
	}
	catch (error) {
		console.error("Failed to calculate shard count:", error);
		console.log("Falling back to 'auto' shard count");
		return "auto";
	}
}

// Initialize the ShardingManager with calculated shard count
async function initShardManager() {
	const totalShards = await calculateShardCount();

	const manager = new ShardingManager(shardFile, {
		token: process.env.TOKEN,
		totalShards,
		respawn: true,
		mode: "process",
		execArgv: ["--max-old-space-size=256", "--loader", "@swc-node/register/esm", "--no-warnings", "--enable-source-maps", "--env-file", ".env"],
	});

	manager.on("shardCreate", shard => {
		console.log(`[Manager] Launched shard ${shard.id}`);

		shard.on("error", error => {
			console.error(`[Shard ${shard.id}] Error:`, error);
		});

		shard.on("death", () => {
			console.error(`[Shard ${shard.id}] Process died unexpectedly`);
		});
	});

	// Start spawning shards
	await manager.spawn().catch(error => {
		console.error("[Manager] Failed to spawn shards:", error);
	});
}

// Start the process
initShardManager().catch(error => {
	console.error("Failed to initialize shard manager:", error);
});