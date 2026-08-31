import assert from 'node:assert'
import { Migrations, ClassMigrations, toTableName } from '../migrations.js'
import { Migrations as CMigrations, ClassMigrations as CClassMigrations } from '../cmigrations.js'

function createMockDb() {
  const meta = new Map()
  const executedStatements = []
  const appliedMigrations = new Map()

  const mockDb = {
    meta,
    executedStatements,
    appliedMigrations,
    prepare(sql) {
      let boundArgs = []
      return {
        bind(...args) {
          boundArgs = args
          return this
        },
        async run() {
          executedStatements.push(sql)

          if (sql.startsWith('PRAGMA table_list')) {
            return { results: [] }
          }
          if (sql.startsWith('PRAGMA table_info')) {
            return { results: [] }
          }
          if (sql.startsWith('PRAGMA index_list')) {
            return { results: [] }
          }
          if (sql.includes('INSERT OR REPLACE INTO _migration_meta') || sql.includes('INSERT INTO _migration_meta')) {
            if (sql.includes("'schemaHash'")) {
              meta.set('schemaHash', boundArgs[0])
            } else if (sql.includes("'schema_hash'")) {
              meta.set('schema_hash', boundArgs[0])
            } else {
              const key = boundArgs[0] || 'schemaHash'
              const val = boundArgs[1] || boundArgs[0]
              meta.set(key, val)
            }
          }
          if (sql.includes('INSERT INTO _migrations') || sql.includes('INSERT OR REPLACE INTO _migrations')) {
            const id = boundArgs[0]
            const hash = boundArgs[1]
            appliedMigrations.set(id, hash)
          }
          if (sql.includes('SELECT id, hash FROM _migrations')) {
            const results = Array.from(appliedMigrations.entries()).map(([id, hash]) => ({ id, hash }))
            return { results }
          }
          return { success: true }
        },
        async first(col) {
          if (sql.includes("key = 'schemaHash'") || sql.includes('key = "schemaHash"')) {
            return meta.get('schemaHash') || null
          }
          if (sql.includes("key = 'schema_hash'") || sql.includes('key = "schema_hash"')) {
            return meta.get('schema_hash') || null
          }
          return null
        },
      }
    },
  }

  return mockDb
}

async function runUnitTests() {
  console.log('Running unified Migrations unit tests...')

  // Test 1: Export compatibility
  assert.strictEqual(Migrations, ClassMigrations, 'ClassMigrations should be alias of Migrations')
  assert.strictEqual(Migrations, CMigrations, 'cmigrations.js re-export should match')
  assert.strictEqual(ClassMigrations, CClassMigrations, 'cmigrations.js ClassMigrations re-export should match')

  // Test 2: Schema creation, partial indexes, and camelCase schemaHash
  {
    const mockDb = createMockDb()

    class Email {
      static properties = {
        id: { type: String, primaryKey: true },
        status: {
          type: String,
          index: { where: 'status != "archived"' },
        },
        email: {
          type: String,
          index: { unique: true, where: 'deletedAt IS NULL', name: 'idx_custom_email' },
        },
        data: {
          type: Object,
          direction: {
            type: String,
            index: { where: 'json_extract(data, \'$.direction\') != "outgoing"' },
          },
        },
      }

      static indexes = [
        ['threadId', 'data.direction'],
        {
          columns: ['threadId', 'status'],
          where: 'deletedAt IS NULL',
          name: 'custom_composite_partial_idx',
        },
        {
          columns: ['threadId', 'data.direction DESC'],
          unique: true,
          where: 'status = "active"',
        },
      ]
    }

    const migrations = new Migrations(mockDb, [Email])
    await migrations.run()

    // Assert single partial index
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes('CREATE INDEX IF NOT EXISTS emails_status_idx ON emails (status) WHERE status != "archived"')
      ),
      'Should create single partial index'
    )

    // Assert single partial index with custom name & unique
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_email ON emails (email) WHERE deletedAt IS NULL')
      ),
      'Should create unique partial index with custom name'
    )

    // Assert JSON sub-field partial index
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes(
          "CREATE INDEX IF NOT EXISTS emails_data_direction_idx ON emails (json_extract(data, '$.direction')) WHERE json_extract(data, '$.direction') != \"outgoing\""
        )
      ),
      'Should create JSON sub-field partial index'
    )

    // Assert composite standard index
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes(
          "CREATE INDEX IF NOT EXISTS emails_threadId_data_direction_idx ON emails (threadId, json_extract(data, '$.direction'))"
        )
      ),
      'Should create composite index'
    )

    // Assert composite partial index with custom name
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes(
          'CREATE INDEX IF NOT EXISTS custom_composite_partial_idx ON emails (threadId, status) WHERE deletedAt IS NULL'
        )
      ),
      'Should create composite partial index with custom name'
    )

    // Assert composite unique partial index with sort
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes(
          "CREATE UNIQUE INDEX IF NOT EXISTS emails_threadId_data_direction_DESC_idx ON emails (threadId, json_extract(data, '$.direction') DESC) WHERE status = \"active\""
        )
      ),
      'Should create composite unique partial index with sort and where clause'
    )

    // Assert camelCase schemaHash stored
    assert(
      mockDb.executedStatements.some((stmt) =>
        stmt.includes("INSERT OR REPLACE INTO _migration_meta (key, value) VALUES ('schemaHash', ?)")
      ),
      'Should store schemaHash in _migration_meta using camelCase key'
    )

    assert(mockDb.meta.get('schemaHash'), 'schemaHash should be saved in meta')
  }

  // Test 3: Arbitrary SQL migrations, functions, objects, and class-level static migrations
  {
    const mockDb = createMockDb()
    let asyncFunctionRan = false

    class User {
      static properties = {
        id: { type: String, primaryKey: true },
        role: { type: String },
      }

      static migrations = [
        `UPDATE users SET role = 'member' WHERE role IS NULL`,
        {
          id: 'seed-admin-user',
          up: `INSERT OR IGNORE INTO users (id, role) VALUES ('admin', 'superuser')`,
        },
      ]
    }

    async function BackfillUsers(db) {
      await db.prepare(`UPDATE users SET role = 'backfilled' WHERE role = 'member'`).run()
    }

    const migrations = new Migrations(mockDb, [
      User,
      BackfillUsers,
      `UPDATE settings SET initialized = 1 WHERE initialized IS NULL`,
      {
        id: 'custom-async-migration',
        up: async (db) => {
          asyncFunctionRan = true
          await db.prepare(`UPDATE users SET role = 'root' WHERE id = 'admin'`).run()
        },
      },
    ])

    await migrations.run()

    // Verify executions
    assert(
      mockDb.executedStatements.some((s) => s.includes("UPDATE users SET role = 'member' WHERE role IS NULL")),
      'Class static SQL migration should execute'
    )
    assert(
      mockDb.executedStatements.some((s) => s.includes("INSERT OR IGNORE INTO users (id, role) VALUES ('admin', 'superuser')")),
      'Class static object migration should execute'
    )
    assert(
      mockDb.executedStatements.some((s) => s.includes("UPDATE users SET role = 'backfilled' WHERE role = 'member'")),
      'Capitalized named function migration should execute'
    )
    assert(
      mockDb.executedStatements.some((s) => s.includes("UPDATE settings SET initialized = 1 WHERE initialized IS NULL")),
      'Top-level SQL migration should execute'
    )
    assert(asyncFunctionRan, 'Async function migration should execute')
    assert(
      mockDb.executedStatements.some((s) => s.includes("UPDATE users SET role = 'root' WHERE id = 'admin'")),
      'Async migration inner statement should execute'
    )

    // Verify _migrations table recording
    assert(mockDb.appliedMigrations.has('seed-admin-user'), 'Custom ID migration should be recorded in _migrations')
    assert(mockDb.appliedMigrations.has('BackfillUsers'), 'Capitalized named function migration should be recorded in _migrations')
    assert(mockDb.appliedMigrations.has('custom-async-migration'), 'Async function migration should be recorded in _migrations')
    assert(mockDb.appliedMigrations.size >= 5, 'All arbitrary migrations should be tracked in _migrations')
  }

  // Test 4: Fast-path skip when schemaHash matches
  {
    const mockDb = createMockDb()

    class Item {
      static properties = {
        id: { type: String, primaryKey: true },
      }
    }

    const m1 = new Migrations(mockDb, [Item, `UPDATE items SET val = 1`])
    await m1.run()

    const initialStatementCount = mockDb.executedStatements.length

    // Second run with matching hash
    const m2 = new Migrations(mockDb, [Item, `UPDATE items SET val = 1`])
    await m2.run()

    // Second run should only do SELECT schemaHash and exit immediately
    const statementsAfterSecondRun = mockDb.executedStatements.length
    assert.strictEqual(
      statementsAfterSecondRun,
      initialStatementCount,
      'Second run should skip all DDL and migration execution when schemaHash matches'
    )
  }

  // Test 5: Adding a new arbitrary migration only runs the new one
  {
    const mockDb = createMockDb()

    class Item {
      static properties = {
        id: { type: String, primaryKey: true },
      }
    }

    const m1 = new Migrations(mockDb, [Item, `UPDATE items SET v = 1`])
    await m1.run()

    // Clear executed statements log to test only what runs in the second phase
    mockDb.executedStatements.length = 0

    // Add a second arbitrary migration
    let migration2Ran = false
    const m2 = new Migrations(mockDb, [
      Item,
      `UPDATE items SET v = 1`,
      {
        id: 'migration-2',
        up: async (db) => {
          migration2Ran = true
        },
      },
    ])
    await m2.run()

    assert(migration2Ran, 'New migration should run')
    assert(mockDb.appliedMigrations.has('migration-2'), 'New migration should be recorded')
  }

  // Test 6: Deleting an old arbitrary migration cleanly updates schemaHash without errors
  {
    const mockDb = createMockDb()

    class Item {
      static properties = {
        id: { type: String, primaryKey: true },
      }
    }

    const m1 = new Migrations(mockDb, [Item, `UPDATE items SET temp = 1`])
    await m1.run()

    const oldHash = mockDb.meta.get('schemaHash')

    // Developer removes the old arbitrary migration
    const m2 = new Migrations(mockDb, [Item])
    await m2.run()

    const newHash = mockDb.meta.get('schemaHash')
    assert.notStrictEqual(oldHash, newHash, 'schemaHash should update when an arbitrary migration is removed')
  }

  console.log('All unit tests passed successfully!')
}

runUnitTests().catch((err) => {
  console.error('Unit tests failed:', err)
  process.exit(1)
})
