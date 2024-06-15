import { Collection } from "discord.js";

import type { BaseOption } from "./base-option.ts";
import { AdminOption } from "./options/admin.option.ts";
import { AdminsOption } from "./options/admins.option.ts";
import { AutopullToggleOption } from "./options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "./options/badge-toggle.option.ts";
import { BlacklistedOption } from "./options/blacklisted.option.ts";
import { BlacklistedsOption } from "./options/blacklisteds.option.ts";
import { ButtonsToggleOption } from "./options/buttons-toggle.option.ts";
import { ColorOption } from "./options/color.option.ts";
import { CommandOption } from "./options/command.option.ts";
import { CronOption } from "./options/cron.option.ts";
import { DisplayOption } from "./options/display.option.ts";
import { DisplayUpdateTypeOption } from "./options/display-update-type.option.ts";
import { DisplaysOption } from "./options/displays.option.ts";
import { HeaderOption } from "./options/header.option.ts";
import { InlineToggleOption } from "./options/inline-toggle.option.ts";
import { JoinSyncToggleOption } from "./options/join-sync-toggle.option.ts";
import { LeaveSyncToggleOption } from "./options/leave-sync-toggle.option.ts";
import { LockToggleOption } from "./options/lock-toggle.option.ts";
import { LogChannelOption } from "./options/log-channel.option.ts";
import { LogScopeOption } from "./options/log-scope.option.ts";
import { MemberOption } from "./options/member.option.ts";
import { MemberDisplayTypeOption } from "./options/member-display-type.option.ts";
import { MembersOption } from "./options/members.option.ts";
import { MentionableOption } from "./options/mentionable.option.ts";
import { MessageOption } from "./options/message.option.ts";
import { MessageChannelOption } from "./options/message-channel.option.ts";
import { NameOption } from "./options/name.option.ts";
import { NotificationsToggleOption } from "./options/notifications-enable.option.ts";
import { NumberOption } from "./options/number.option.ts";
import { PositionOption } from "./options/position.option.ts";
import { PrioritizedOption } from "./options/prioritized.option.ts";
import { PrioritizedsOption } from "./options/prioritizeds.option.ts";
import { PriorityOrderOption } from "./options/priority-order.option.ts";
import { PullBatchSizeOption } from "./options/pull-batch-size.option.ts";
import { PullMessageOption } from "./options/pull-message.option.ts";
import { QueueOption } from "./options/queue.option.ts";
import { QueuesOption } from "./options/queues.option.ts";
import { ReasonOption } from "./options/reason.option.ts";
import { RejoinCooldownPeriodOption } from "./options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "./options/rejoin-grace-period.option.ts";
import { RoleInQueueOption } from "./options/role-in-queue.option.ts";
import { RoleOnPullOption } from "./options/role-on-pull.option.ts";
import { ScheduleOption } from "./options/schedule.option.ts";
import { SchedulesOption } from "./options/schedules.option.ts";
import { SizeOption } from "./options/size.option.ts";
import { TimestampTypeOption } from "./options/timestamp-type.option.ts";
import { TimezoneOption } from "./options/timezone.option.ts";
import { VoiceOption } from "./options/voice.option.ts";
import { VoiceDestinationChannelOption } from "./options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "./options/voice-only-toggle.option.ts";
import { VoiceSourceChannelOption } from "./options/voice-source-channel.option.ts";
import { VoicesOption } from "./options/voices.option.ts";
import { WhitelistedOption } from "./options/whitelisted.option.ts";
import { WhitelistedsOption } from "./options/whitelisteds.option.ts";

export const OPTIONS = new Collection<string, BaseOption>([
	[AdminOption.ID, new AdminOption()],
	[AdminsOption.ID, new AdminsOption()],
	[AutopullToggleOption.ID, new AutopullToggleOption()],
	[BadgeToggleOption.ID, new BadgeToggleOption()],
	[BlacklistedOption.ID, new BlacklistedOption()],
	[BlacklistedsOption.ID, new BlacklistedsOption()],
	[ButtonsToggleOption.ID, new ButtonsToggleOption()],
	[ColorOption.ID, new ColorOption()],
	[CommandOption.ID, new CommandOption()],
	[CronOption.ID, new CronOption()],
	[DisplayOption.ID, new DisplayOption()],
	[DisplaysOption.ID, new DisplaysOption()],
	[DisplayUpdateTypeOption.ID, new DisplayUpdateTypeOption()],
	[HeaderOption.ID, new HeaderOption()],
	[InlineToggleOption.ID, new InlineToggleOption()],
	[JoinSyncToggleOption.ID, new JoinSyncToggleOption()],
	[LeaveSyncToggleOption.ID, new LeaveSyncToggleOption()],
	[LockToggleOption.ID, new LockToggleOption()],
	[LogChannelOption.ID, new LogChannelOption()],
	[LogScopeOption.ID, new LogScopeOption()],
	[MemberOption.ID, new MemberOption()],
	[MemberDisplayTypeOption.ID, new MemberDisplayTypeOption()],
	[MembersOption.ID, new MembersOption()],
	[MentionableOption.ID, new MentionableOption()],
	[MessageChannelOption.ID, new MessageChannelOption()],
	[MessageOption.ID, new MessageOption()],
	[NameOption.ID, new NameOption()],
	[NotificationsToggleOption.ID, new NotificationsToggleOption()],
	[NumberOption.ID, new NumberOption()],
	[PositionOption.ID, new PositionOption()],
	[PrioritizedOption.ID, new PrioritizedOption()],
	[PrioritizedsOption.ID, new PrioritizedsOption()],
	[PriorityOrderOption.ID, new PriorityOrderOption()],
	[PullBatchSizeOption.ID, new PullBatchSizeOption()],
	[PullMessageOption.ID, new PullMessageOption()],
	[QueueOption.ID, new QueueOption()],
	[QueuesOption.ID, new QueuesOption()],
	[ReasonOption.ID, new ReasonOption()],
	[RejoinCooldownPeriodOption.ID, new RejoinCooldownPeriodOption()],
	[RejoinGracePeriodOption.ID, new RejoinGracePeriodOption()],
	[RoleInQueueOption.ID, new RoleInQueueOption()],
	[RoleOnPullOption.ID, new RoleOnPullOption()],
	[ScheduleOption.ID, new ScheduleOption()],
	[SchedulesOption.ID, new SchedulesOption()],
	[SizeOption.ID, new SizeOption()],
	[TimestampTypeOption.ID, new TimestampTypeOption()],
	[TimezoneOption.ID, new TimezoneOption()],
	[VoiceOption.ID, new VoiceOption()],
	[VoicesOption.ID, new VoicesOption()],
	[VoiceDestinationChannelOption.ID, new VoiceDestinationChannelOption()],
	[VoiceSourceChannelOption.ID, new VoiceSourceChannelOption()],
	[VoiceOnlyToggleOption.ID, new VoiceOnlyToggleOption()],
	[WhitelistedOption.ID, new WhitelistedOption()],
	[WhitelistedsOption.ID, new WhitelistedsOption()],
]);
