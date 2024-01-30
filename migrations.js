
/**
 * Could turn this into a lib.
 * 
 * let m = new Migrations()
 * m.add(`SQL STATEMENTS`)
 * m.run()
 * 💥
 */
let runCount = 0

export class Migrations {

    constructor(db) {
        this.db = db
        this.migrations = [
            `CREATE TABLE IF NOT EXISTS migrations (id integer PRIMARY KEY, createdAt text)`, // the default migration table
        ]
    }

    add(sql) {
        this.migrations.push(sql)
    }

    async run() {
        if (runCount > 0) return
        runCount++

        console.log("RUNNING MIGRATIONS")
        let db = this.db
        // check current version
        let lastMigration = -1
        try {
            let r = await this.db.prepare("SELECT * FROM migrations order by id desc").first()
            console.log("LAST MIGRATION:", r)
            // return
            lastMigration = r.id
        } catch (e) {
            console.error("ERROR:", e)
            if (!e.message.includes('no such table')) {
                // run migrations
                throw e
            }
            // otherwise, continue
        }

        let i = 0
        for (const m of this.migrations) {
            console.log("MIGRATION:", i, lastMigration)
            if (lastMigration >= i) {
                i++
                continue
            }
            console.log("RUNNING MIGRATION: ", i, m)
            try {
                await db.exec(m)
                await db.exec(`INSERT INTO migrations (id, createdAt) VALUES (${i}, datetime('now'))`)
            } catch (e) {
                console.error("ERROR:", e)
                throw e
            }
            i++
        }
    }
}

// default:
// var migrations = new Migrations()
// export { migrations }