
/**
 * Could turn this into a lib.
 * 
 * let m = new Migrations()
 * m.add(`SQL STATEMENTS`)
 * m.run()
 * 💥
 */
let runCount = 0

export async function runMigrations(db) {
    if (runCount > 0) return
    runCount++

    console.log("RUNNING MIGRATIONS")
    // check current version
    let lastMigration = -1
    try {
        let r = await db.prepare("SELECT * FROM migrations order by id desc").first()
        console.log("MIGRATION R first:", r)
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
    for (const m of migrations()) {
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

