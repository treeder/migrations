import assert from 'node:assert'
import { ClassMigrations } from '../cmigrations.js'

async function runUnitTests() {
  console.log('Running ClassMigrations unit tests...')

  const executedStatements = []
  const mockDb = {
    prepare(sql) {
      return {
        bind(...args) {
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
          return { success: true }
        },
        async first(col) {
          return null
        },
      }
    },
  }

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

  const migrations = new ClassMigrations(mockDb, [Email])
  await migrations.run()

  console.log('Executed SQL statements:\n', executedStatements.join('\n'))

  // Assert single partial index
  assert(
    executedStatements.some((stmt) =>
      stmt.includes('CREATE INDEX IF NOT EXISTS emails_status_idx ON emails (status) WHERE status != "archived"')
    ),
    'Should create single partial index'
  )

  // Assert single partial index with custom name & unique
  assert(
    executedStatements.some((stmt) =>
      stmt.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_email ON emails (email) WHERE deletedAt IS NULL')
    ),
    'Should create unique partial index with custom name'
  )

  // Assert JSON sub-field partial index
  assert(
    executedStatements.some((stmt) =>
      stmt.includes(
        "CREATE INDEX IF NOT EXISTS emails_data_direction_idx ON emails (json_extract(data, '$.direction')) WHERE json_extract(data, '$.direction') != \"outgoing\""
      )
    ),
    'Should create JSON sub-field partial index'
  )

  // Assert composite standard index
  assert(
    executedStatements.some((stmt) =>
      stmt.includes(
        "CREATE INDEX IF NOT EXISTS emails_threadId_data_direction_idx ON emails (threadId, json_extract(data, '$.direction'))"
      )
    ),
    'Should create composite index'
  )

  // Assert composite partial index with custom name
  assert(
    executedStatements.some((stmt) =>
      stmt.includes(
        'CREATE INDEX IF NOT EXISTS custom_composite_partial_idx ON emails (threadId, status) WHERE deletedAt IS NULL'
      )
    ),
    'Should create composite partial index with custom name'
  )

  // Assert composite unique partial index with sort
  assert(
    executedStatements.some((stmt) =>
      stmt.includes(
        "CREATE UNIQUE INDEX IF NOT EXISTS emails_threadId_data_direction_DESC_idx ON emails (threadId, json_extract(data, '$.direction') DESC) WHERE status = \"active\""
      )
    ),
    'Should create composite unique partial index with sort and where clause'
  )

  console.log('All unit tests passed successfully!')
}

runUnitTests().catch((err) => {
  console.error('Unit tests failed:', err)
  process.exit(1)
})
