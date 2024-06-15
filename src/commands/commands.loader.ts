import { Collection } from "discord.js";

import type { Command } from "../types/command.types.ts";
import { AdminsCommand } from "./commands/admins.command.ts";
import { BlacklistCommand } from "./commands/blacklist.command.ts";
import { ClearCommand } from "./commands/clear.command.ts";
import { DisplaysCommand } from "./commands/displays.command.ts";
import { HelpCommand } from "./commands/help.command.ts";
import { JoinCommand } from "./commands/join.command.ts";
import { LeaveCommand } from "./commands/leave.command.ts";
import { LoggingCommand } from "./commands/logging.command.ts";
import { MembersCommand } from "./commands/members.command.ts";
import { MoveCommand } from "./commands/move.command.ts";
import { PositionsCommand } from "./commands/positions.command.ts";
import { PrioritizeCommand } from "./commands/prioritize.command.ts";
import { PullCommand } from "./commands/pull.command.ts";
import { QueuesCommand } from "./commands/queues.command.ts";
import { ScheduleCommand } from "./commands/schedule.command.ts";
import { ShowCommand } from "./commands/show.command.ts";
import { ShuffleCommand } from "./commands/shuffle.command.ts";
import { VoiceCommand } from "./commands/voice.command.ts";
import { WhitelistCommand } from "./commands/whitelist.command.ts";

export const COMMANDS = new Collection<string, Command>([
	[AdminsCommand.ID, new AdminsCommand()],
	[BlacklistCommand.ID, new BlacklistCommand()],
	[ClearCommand.ID, new ClearCommand()],
	[DisplaysCommand.ID, new DisplaysCommand()],
	[HelpCommand.ID, new HelpCommand()],
	[JoinCommand.ID, new JoinCommand()],
	[LeaveCommand.ID, new LeaveCommand()],
	[LoggingCommand.ID, new LoggingCommand()],
	[MembersCommand.ID, new MembersCommand()],
	[MoveCommand.ID, new MoveCommand()],
	[PositionsCommand.ID, new PositionsCommand()],
	[PrioritizeCommand.ID, new PrioritizeCommand()],
	[PullCommand.ID, new PullCommand()],
	[QueuesCommand.ID, new QueuesCommand()],
	[ScheduleCommand.ID, new ScheduleCommand()],
	[ShowCommand.ID, new ShowCommand()],
	[ShuffleCommand.ID, new ShuffleCommand()],
	[VoiceCommand.ID, new VoiceCommand()],
	[VoiceCommand.ID, new VoiceCommand()],
	[WhitelistCommand.ID, new WhitelistCommand()],
]);
