import { PgTable } from "drizzle-orm/pg-core";
import { db as writeDb, getDatabase } from "../../manager";
import { getTransactionContext, TransactionDB } from "../../transaction";

interface DrizzleTableWithUtils extends PgTable
{
    getTableName: () => string;
}

export class Repository<TTable extends DrizzleTableWithUtils>
{
    constructor(protected table: TTable) {}

    protected get readDb(): TransactionDB
    {
        const db = getDatabase('read');
        if(db)
        {
            return db;
        }

        return this.writeDb;
    }

    protected get writeDb(): TransactionDB
    {
        const context = getTransactionContext();
        if(context)
        {
            const { tx } = context;
            return tx;
        }

        return writeDb;
    }

    protected async select()
    {
        return this.readDb.select().from(this.table as PgTable);
    }

    protected async selectOne()
    {
        return this.readDb.select().from(this.table as PgTable).limit(1);
    }

    protected async insert()
    {
        return this.writeDb.insert(this.table as PgTable);
    }
}