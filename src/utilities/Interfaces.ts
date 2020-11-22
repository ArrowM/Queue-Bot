export interface ParsedArguments {
   command: string;
   arguments: string;
}

export interface QueueChannel {
   queue_channel_id: string;
   guild_id: string;
   max_members: string;
}

export interface DisplayChannel {
   queue_channel_id: string;
   display_channel_id: string;
   embed_id: string;
}

export interface QueueGuild {
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
