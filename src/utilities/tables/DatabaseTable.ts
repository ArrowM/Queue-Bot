import { BaseClass } from "../../BaseClass";

export abstract class DatabaseTable extends BaseClass {
    protected abstract updateTableStructure(): Promise<void>;
    public abstract initTable(): Promise<void>;
}