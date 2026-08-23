/**
 * Unified SQLite / Cloudflare D1 migration library.
 * Supports declarative model classes and arbitrary data/schema migrations with content hashing.
 */
export class Migrations {
  constructor(db, items = []) {
    this.db = db
    this.classes = []
    this.arbitraryMigrations = []
    this.finished = null

    for (const item of items) {
      this.add(item)
    }
  }

  add(item) {
    if (isModelClass(item)) {
      this.classes.push(item)
    } else {
      this.arbitraryMigrations.push(item)
    }
  }

  addMigration(migration) {
    this.arbitraryMigrations.push(migration)
  }

  async run() {
    // Ensure it only runs once per instance
    if (this.finished) return this.finished
    this.finished = this.runInternal()
    return await this.finished
  }

  async runInternal() {
    console.log('Running migrations...')

    let schemaHash
    try {
      schemaHash = await this.computeSchemaHash()
    } catch (hashErr) {
      console.error(`[migrations] Failed to compute schema hash: ${hashErr.message}`)
    }

    if (schemaHash) {
      try {
        let storedHash = await this.db
          .prepare(`SELECT value FROM _migration_meta WHERE key = 'schemaHash'`)
          .first('value')
        // Backward compatibility check for snake_case
        if (!storedHash) {
          storedHash = await this.db
            .prepare(`SELECT value FROM _migration_meta WHERE key = 'schema_hash'`)
            .first('value')
        }
        if (storedHash === schemaHash) {
          console.log(`[migrations] Schema hash matches (${schemaHash.slice(0, 8)}). Skipping migrations.`)
          return
        }
      } catch (err) {
        // If table doesn't exist or other error, run migrations as usual
        console.log(`[migrations] Meta table not found or error reading hash: ${err.message}. Running migrations.`)
      }
    }

    // Step 1: Sync tables and indexes for model classes
    if (this.classes.length > 0) {
      let r = await this.db.prepare('PRAGMA table_list').run()
      let tables = r.results || []

      for (const clz of this.classes) {
        let tableName = clz.table || toTableName(clz.name)
        let table = tables.find((t) => t.name === tableName)
        if (!table) {
          await this.createTable(tableName, clz)
        } else {
          await this.checkForChanges(tableName, clz)
        }
      }
    }

    // Step 2: Run unapplied arbitrary migrations
    await this.runArbitraryMigrations()

    // Step 3: Save the updated schemaHash
    if (schemaHash) {
      try {
        await this.db.prepare(`CREATE TABLE IF NOT EXISTS _migration_meta (key TEXT PRIMARY KEY, value TEXT)`).run()
        await this.db
          .prepare(`INSERT OR REPLACE INTO _migration_meta (key, value) VALUES ('schemaHash', ?)`)
          .bind(schemaHash)
          .run()
        console.log(`[migrations] Schema hash saved: ${schemaHash.slice(0, 8)}`)
      } catch (saveErr) {
        console.error(`[migrations] Failed to save schema hash: ${saveErr.message}`)
      }
    }

    console.log('migrations complete')
  }

  getAllArbitraryMigrations() {
    const list = []
    for (const clz of this.classes) {
      if (Array.isArray(clz.migrations)) {
        for (const m of clz.migrations) {
          list.push(m)
        }
      }
    }
    for (const m of this.arbitraryMigrations) {
      list.push(m)
    }
    return list
  }

  async runArbitraryMigrations() {
    const arbitraryList = this.getAllArbitraryMigrations()
    if (arbitraryList.length === 0) return

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, hash TEXT, appliedAt TEXT)`).run()

    const applied = new Map()
    try {
      const res = await this.db.prepare(`SELECT id, hash FROM _migrations`).run()
      if (res && res.results) {
        for (const row of res.results) {
          applied.set(row.id, row.hash)
        }
      }
    } catch (err) {
      // Table might be freshly created or empty
    }

    for (const m of arbitraryList) {
      const { id, hash } = await getMigrationDetails(m)
      if (applied.has(id)) {
        continue
      }

      console.log(`[migrations] Running arbitrary migration: ${id}`)
      await executeArbitraryMigration(this.db, m)

      await this.db
        .prepare(`INSERT INTO _migrations (id, hash, appliedAt) VALUES (?, ?, datetime('now'))`)
        .bind(id, hash)
        .run()
      applied.set(id, hash)
    }
  }

  async computeSchemaHash() {
    // 1. Sort classes by their table name or class name to ensure class registration order doesn't affect the hash
    const sortedClasses = [...this.classes].sort((a, b) => {
      const nameA = a.table || a.name || ''
      const nameB = b.table || b.name || ''
      return nameA.localeCompare(nameB)
    })

    const schemaStrings = sortedClasses.map((clz) => {
      // Sort keys of the properties object to ensure property definition order doesn't affect the hash
      const props = clz.properties
        ? JSON.stringify(sortKeys(clz.properties), (key, value) => {
            if (typeof value === 'function') {
              return value.name || value.toString()
            }
            return value
          })
        : ''

      // Sort index configurations to ensure index declaration order doesn't affect the hash
      const indexes = clz.indexes
        ? JSON.stringify(
            clz.indexes
              .map((idx) => {
                if (Array.isArray(idx)) {
                  return idx
                } else if (idx && typeof idx === 'object') {
                  return Object.keys(idx)
                    .sort()
                    .reduce((acc, k) => {
                      acc[k] = idx[k]
                      return acc
                    }, {})
                }
                return idx
              })
              .map((idx) => JSON.stringify(idx))
              .sort()
              .map((str) => JSON.parse(str))
          )
        : ''

      const classMigrations = Array.isArray(clz.migrations)
        ? JSON.stringify(
            clz.migrations.map((m) => {
              if (typeof m === 'string') return m
              if (typeof m === 'function') return m.name || m.toString()
              if (typeof m === 'object' && m !== null) {
                return { id: m.id || m.name, sql: m.sql || (typeof m.up === 'function' ? m.up.toString() : m.up) }
              }
              return String(m)
            })
          )
        : ''

      return `${clz.table || clz.name}:${props}:${indexes}:${classMigrations}`
    })

    const arbitraryStrings = this.arbitraryMigrations.map((m) => {
      if (typeof m === 'string') return `migration:${m}`
      if (typeof m === 'function') return `migration:${m.name || m.toString()}`
      if (typeof m === 'object' && m !== null) {
        return `migration:${m.id || m.name || ''}:${m.sql || (typeof m.up === 'function' ? m.up.toString() : m.up) || ''}`
      }
      return `migration:${String(m)}`
    })

    const combinedSchema = [...schemaStrings, ...arbitraryStrings].join('\n')
    return await hashString(combinedSchema)
  }

  async createTable(tableName, clz) {
    console.log(`CREATING TABLE ${tableName}`)
    let stmt = `CREATE TABLE ${tableName} (`
    for (const propName in clz.properties) {
      let prop = clz.properties[propName]
      stmt += `${propName} ${this.toSQLiteType(prop.type)}`
      if (prop.primaryKey) stmt += ' PRIMARY KEY'
      stmt += ','
    }
    stmt = stmt.slice(0, -1)
    stmt += ')'
    console.log(stmt)
    await this.db.prepare(stmt).run()
    await this.checkForIndexes(tableName, clz)
  }

  async checkForChanges(tableName, clz) {
    // Check if any properties changed and do alter tables if so
    let r = await this.db.prepare(`PRAGMA table_info("${tableName}")`).run()
    let columns = r.results || []
    for (const propName in clz.properties) {
      let prop = clz.properties[propName]
      let col = columns.find((c) => c.name === propName)
      if (!col) {
        let stmt = `ALTER TABLE ${tableName} ADD COLUMN `
        stmt += `${propName} ${this.toSQLiteType(prop.type)}`
        if (prop.primaryKey) stmt += ' PRIMARY KEY'
        console.log(stmt)
        await this.db.prepare(stmt).run()
      }
    }
    await this.checkForIndexes(tableName, clz)
  }

  async checkForIndexes(tableName, clz) {
    for (const propName in clz.properties) {
      let prop = clz.properties[propName]
      if (prop.index) {
        await this.checkForIndex(tableName, propName, prop)
      }
      await this.checkForSubFieldIndexes(tableName, propName, prop)
    }
    if (clz.indexes) {
      for (const indexDef of clz.indexes) {
        await this.checkCompositeIndex(tableName, indexDef)
      }
    }
  }

  async checkForSubFieldIndexes(tableName, colName, prop, path = []) {
    if (!prop || typeof prop !== 'object') return
    const reservedKeys = ['type', 'primaryKey', 'index', 'parse', 'default']
    for (const key in prop) {
      if (reservedKeys.includes(key)) continue
      const subProp = prop[key]
      if (!subProp || typeof subProp !== 'object') continue

      const currentPath = [...path, key]
      if (subProp.index) {
        await this.checkForJsonIndex(tableName, colName, currentPath, subProp)
      }
      await this.checkForSubFieldIndexes(tableName, colName, subProp, currentPath)
    }
  }

  async checkForJsonIndex(tableName, colName, path, prop) {
    if (prop.index) {
      let sort = ''
      let where = ''
      let customName = null
      if (typeof prop.index === 'object') {
        if (prop.index.sort) sort = prop.index.sort.toUpperCase()
        if (prop.index.where) where = prop.index.where
        if (prop.index.name) customName = prop.index.name
      } else if (typeof prop.index === 'string' && ['asc', 'desc'].includes(prop.index.toLowerCase())) {
        sort = prop.index.toUpperCase()
      }

      let jsonPath = path.join('.')
      let pathSuffix = path.join('_')
      let indexSuffix = sort ? `_${sort}` : ''
      let indexName = customName || `${tableName}_${colName}_${pathSuffix}${indexSuffix}_idx`
      let stmt = `PRAGMA index_list("${tableName}")`
      let idx = await this.db.prepare(stmt).run()
      let existingIndex = (idx.results || []).find((i) => i.name === indexName)
      if (existingIndex) {
        return
      }
      let colExpr = `json_extract(${colName}, '$.${jsonPath}')`
      if (sort) colExpr += ` ${sort}`
      let whereClause = where ? ` WHERE ${where}` : ''
      stmt = `CREATE${prop.index.unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${colExpr})${whereClause}`
      console.log('json index does not exist, creating it', stmt)
      let dr = await this.db.prepare(stmt).run()
      console.log('JSON INDEX CREATED', dr)
    }
  }

  async checkCompositeIndex(tableName, indexDef) {
    let columns = []
    let unique = false
    let where = ''
    let customName = null
    if (Array.isArray(indexDef)) {
      columns = indexDef
    } else {
      columns = indexDef.columns
      unique = indexDef.unique
      where = indexDef.where
      customName = indexDef.name
    }
    if (!columns || columns.length === 0) return

    let cleanCols = columns.map((col) => col.trim().replace(/[^\w]+/g, '_'))
    let indexName = customName || `${tableName}_${cleanCols.join('_')}_idx`
    let stmt = `PRAGMA index_list("${tableName}")`
    let idx = await this.db.prepare(stmt).run()
    let existingIndex = (idx.results || []).find((i) => i.name === indexName)
    if (existingIndex) {
      return
    }
    let sqlCols = columns.map((col) => {
      col = col.trim()
      let parts = col.split(/\s+/)
      let field = parts[0]
      let sort = parts.slice(1).join(' ')
      if (field.includes('.') && !field.includes('(')) {
        let dotParts = field.split('.')
        let root = dotParts[0]
        let path = dotParts.slice(1).join('.')
        field = `json_extract(${root}, '$.${path}')`
      }
      return sort ? `${field} ${sort}` : field
    })
    let whereClause = where ? ` WHERE ${where}` : ''
    stmt = `CREATE${unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${sqlCols.join(', ')})${whereClause}`
    console.log('composite index does not exist, creating it', stmt)
    let dr = await this.db.prepare(stmt).run()
    console.log('COMPOSITE INDEX CREATED', dr)
  }

  async checkForIndex(tableName, propName, prop) {
    if (prop.index) {
      let sort = ''
      let where = ''
      let customName = null
      if (typeof prop.index === 'object') {
        if (prop.index.sort) sort = prop.index.sort.toUpperCase()
        if (prop.index.where) where = prop.index.where
        if (prop.index.name) customName = prop.index.name
      } else if (typeof prop.index === 'string' && ['asc', 'desc'].includes(prop.index.toLowerCase())) {
        sort = prop.index.toUpperCase()
      }

      let indexSuffix = sort ? `_${sort}` : ''
      let indexName = customName || `${tableName}_${propName}${indexSuffix}_idx`
      let stmt = `PRAGMA index_list("${tableName}")`
      let idx = await this.db.prepare(stmt).run()
      let existingIndex = (idx.results || []).find((i) => i.name === indexName)
      if (existingIndex) {
        return
      }
      let columnWithSort = sort ? `${propName} ${sort}` : propName
      let whereClause = where ? ` WHERE ${where}` : ''
      stmt = `CREATE${prop.index.unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnWithSort})${whereClause}`
      console.log('index does not exist, creating it', stmt)
      let dr = await this.db.prepare(stmt).run()
      console.log('INDEX CREATED', dr)
    }
  }

  toSQLiteType(type) {
    switch (type) {
      case String:
        return 'TEXT'
      case Number:
        return 'NUMERIC'
      case Boolean:
        return 'INTEGER'
      case Date:
        return 'TEXT'
      case BigInt:
        return 'TEXT'
      case Object:
        return 'TEXT'
      case Array:
        return 'TEXT'
      default:
        return 'TEXT'
    }
  }
}

// Aliases and utilities
export { Migrations as ClassMigrations }

export function toTableName(str) {
  return pluralize(toCamelCase(str))
}

function toCamelCase(str) {
  return str.charAt(0).toLowerCase() + str.slice(1)
}

function pluralize(str) {
  return str + 's'
}

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj
  }
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeys(obj[key])
      return acc
    }, {})
}

function isModelClass(item) {
  if (!item) return false
  if (typeof item === 'function') {
    if (item.properties || item.indexes || item.table) return true
    if (item.prototype && item.prototype.constructor === item && item.name && /^[A-Z]/.test(item.name)) {
      return true
    }
  }
  return false
}

async function hashString(str) {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : globalThis.crypto
  const msgBuffer = new TextEncoder().encode(str)
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getMigrationDetails(m) {
  let id = null
  let content = ''

  if (typeof m === 'string') {
    content = m.trim()
  } else if (typeof m === 'function') {
    id = m.name || null
    content = m.toString()
  } else if (typeof m === 'object' && m !== null) {
    id = m.id || m.name || null
    content = (m.sql || (typeof m.up === 'function' ? m.up.toString() : m.up) || id || '').trim()
  }

  const hash = await hashString(content || id || '')
  if (!id) {
    id = hash
  }

  return { id, hash, content }
}

async function executeArbitraryMigration(db, m) {
  if (typeof m === 'string') {
    await db.prepare(m).run()
  } else if (typeof m === 'function') {
    await m(db)
  } else if (typeof m === 'object' && m !== null) {
    if (typeof m.up === 'function') {
      await m.up(db)
    } else if (typeof m.up === 'string') {
      await db.prepare(m.up).run()
    } else if (typeof m.sql === 'string') {
      await db.prepare(m.sql).run()
    } else {
      throw new Error(`Invalid migration object: must contain 'up' or 'sql'`)
    }
  }
}
