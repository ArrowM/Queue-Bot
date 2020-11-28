export interface ParsedArguments {
   command: string;
   arguments: string;
}

export interface QueueChannel {
   id: number;
   queue_channel_id: string;
   guild_id: string;
   max_members: string;
}

export interface DisplayChannel {
   id: number;
   queue_channel_id: string;
   display_channel_id: string;
   embed_id: string;
}

export interface QueueGuild {
   id: number;
   guild_id: string;
   grace_period: string;
   prefix: string;
   color: string;
   msg_mode: number;
}

export interface QueueMember {
   id: number;
   queue_channel_id: string;
   queue_member_id: string;
   personal_message: string;
   created_at: string;
}

export interface ConfigFile {
   token: string;
   topGgToken: string;

   color: string;
   databaseType: string;
   databaseHost: string;
   databaseName: string;
   databaseUsername: string;
   databasePassword: string;
   gracePeriod: string;
   permissionsRegexp: string;
   prefix: string;
   joinEmoji: string;

   clearCmd: string;
   colorCmd: string;
   displayCmd: string;
   gracePeriodCmd: string;
   helpCmd: string;
   joinCmd: string;
   kickCmd: string;
   limitCmd: string;
   modeCmd: string;
   nextCmd: string;
   prefixCmd: string;
   queueCmd: string;
   shuffleCmd: string;
   startCmd: string;
}
