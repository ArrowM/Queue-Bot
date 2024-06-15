import * as fs from "node:fs";

import {
	ActivityType,
	ApplicationCommand,
	type Collection,
	type GuildResolvable,
	REST,
	Routes,
	type Snowflake,
	TextChannel,
} from "discord.js";
import { chunk } from "lodash-es";
import AutoPoster from "topgg-autoposter";

import { CLIENT } from "../client/CLIENT.ts";
import { COMMANDS } from "../commands/commands.loader.ts";
import { QueryUtils } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { Color, DisplayUpdateType } from "../types/db.types.ts";
import { DisplayUtils } from "./display.utils.ts";

export namespace ClientUtils {
	// indexed by `id`
	let LIVE_COMMANDS: Collection<Snowflake, ApplicationCommand<{ guild: GuildResolvable }>>;

	export async function registerCommands() {
		try {
			console.time(`Registered ${COMMANDS.size} commands with server`);
			const commandsPutRoute = Routes.applicationCommands(process.env.CLIENT_ID);
			const commandsJSON = COMMANDS.map(c => c.data.toJSON());
			await new REST()
				.setToken(process.env.TOKEN)
				.put(commandsPutRoute, { body: commandsJSON });

			LIVE_COMMANDS = await CLIENT.application.commands.fetch();
			console.timeEnd(`Registered ${COMMANDS.size} commands with server`);
		}
		catch (e) {
			console.error(e);
		}
	}

	export function getLiveCommand(commandName: string) {
		return LIVE_COMMANDS.find(cmd => cmd.name === commandName);
	}

	export async function getGuild(guildId: string) {
		return await CLIENT.guilds.fetch(guildId);
	}

	export async function login() {
		console.time("Logged in");
		await CLIENT.login(process.env.TOKEN);
		CLIENT.user.setActivity({ name: "ready to /help", type: ActivityType.Custom });
		console.timeEnd("Logged in");
	}

	export function verifyRequiredEnvironmentVariables() {
		// Required exist
		[
			"TOKEN",
			"CLIENT_ID",
			"DEFAULT_COLOR",
		].forEach(name => {
			if (process.env[name] == null) {
				throw new Error(`Required environment variable ${name} not set. Please edit .env file`);
			}
		});
		// DEFAULT_COLOR is valid
		if (!Object.keys(Color).includes(process.env.DEFAULT_COLOR as string)) {
			throw new Error(`Invalid DEFAULT_COLOR value. Please edit .env file\nOptions: [${Object.keys(Color).join(", ")}]`);
		}
	}

	export async function checkForPatchNotes() {
		// Check if any patch notes have not been read
		const dbPatchNotes = QueryUtils.selectAllPatchNotes();
		const unreadFileNames = fs.readdirSync("./patch-notes")
			.filter(fileNames => !dbPatchNotes.some(dbPatchNote => dbPatchNote.fileName == fileNames));
		if (unreadFileNames.length === 0) return;

		// Use dynamic import to load the .ts file
		const patchNotesChannelId = process.env.PATCH_NOTES_CHANNEL_ID;
		if (!patchNotesChannelId) return;
		const patchNotesChannel = CLIENT.channels.cache.get(patchNotesChannelId) as TextChannel;
		for (const fileName of unreadFileNames) {
			const { embeds } = await import(`../../patch-notes/${fileName}`);

			// wait for console confirmation
			let userInput = null;
			while (!["1", "2", "3"].includes(userInput)) {
				console.log("");
				console.log(`Patch notes for '${fileName}' have not been sent. Enter a number to continue:`);
				console.log("[1] send patch notes to patch notes channel");
				console.log("[2] mark patch note as already sent");
				console.log("[3] skip");
				userInput = (await new Promise(resolve => process.stdin.once("data", resolve))).toString().trim();
			}
			if (userInput === "1") {
				await patchNotesChannel.send({ embeds });
				QueryUtils.insertPatchNotes({ fileName });
				console.log(`Sent ${fileName}. Continuing...`);
			}
			else if (userInput === "2") {
				QueryUtils.insertPatchNotes({ fileName });
				console.log(`Marked '${fileName}' as sent. Continuing...`);
			}
			else {
				console.log("Continuing...");
			}
		}
	}

	export function loadTopGGAutoPoster() {
		if (process.env.TOP_GG_TOKEN) {
			console.time("Linked Top.gg AutoPoster");
			AutoPoster(process.env.TOP_GG_TOKEN, CLIENT).on("error", () => null);
			console.timeEnd("Linked Top.gg AutoPoster");
		}
	}

	export async function checkForOfflineVoiceChanges() {
		// Force fetch of all guilds
		await CLIENT.guilds.fetch();
		const voices = QueryUtils.selectAllVoices();
		const chunkedVoices = chunk(voices, 10);
		for (let i = 0; i < chunkedVoices.length; i++) {
			const voiceChunk = chunkedVoices[i];
			const promises = voiceChunk.map(async voice => {
				const guild = await getGuild(voice.guildId);
				const store = new Store(guild);
				const queueIds = store.dbQueues().map(queue => queue.id);
				DisplayUtils.requestDisplaysUpdate(store, queueIds, { updateTypeOverride: DisplayUpdateType.Edit });
			});
			if (i < chunkedVoices.length - 1) {
				promises.push(new Promise(resolve => setTimeout(resolve, 3000)));
			}
			await Promise.all(promises);
		}
	}
}
