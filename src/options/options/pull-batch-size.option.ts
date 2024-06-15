import { QUEUE_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class PullBatchSizeOption extends IntegerOption {
	static readonly ID = "pull_batch_size";
	id = PullBatchSizeOption.ID;
	defaultValue = QUEUE_TABLE.pullBatchSize.default;
	minValue = 1;
}
