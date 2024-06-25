import { Events } from "discord.js";

import { CLIENT } from "../client/client.ts";
import { ClientHandler } from "../handlers/client.handler.ts";

export namespace ClientListeners {
	export function load() {
		CLIENT.on(Events.GuildDelete, ClientHandler.handleGuildDelete);

		CLIENT.on(Events.InteractionCreate, ClientHandler.handleInteraction);

		CLIENT.on(Events.MessageCreate, ClientHandler.handleMessageCreate);

		CLIENT.on(Events.GuildRoleDelete, ClientHandler.handleRoleDelete);

		CLIENT.on(Events.GuildMemberRemove, ClientHandler.handleGuildMemberRemove);

		CLIENT.on(Events.ChannelDelete, ClientHandler.handleChannelDelete);

		CLIENT.on(Events.VoiceStateUpdate, ClientHandler.handleVoiceStateUpdate);
	}
}