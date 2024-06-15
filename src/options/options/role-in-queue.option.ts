import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class RoleInQueueOption extends BaseRoleOption {
	static readonly ID = "role_in_queue";
	id = RoleInQueueOption.ID;
}
