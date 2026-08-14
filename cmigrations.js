/**
 * The object oriented version
 */
export class ClassMigrations {
  constructor(db, classes = []) {
    this.db = db
    this.classes = classes
    this.finished = null
  }

  add(clz) {
    this.classes.push(clz)
  }

  async run() {
    // this will ensure it only runs once per instance
    if (this.finished) return this.finished
    this.finished = this.run2()
    return await this.finished
  }

  async run2() {
    console.log('Running migrations...')

    let schemaHash
    try {
      schemaHash = await this.computeSchemaHash()
    } catch (hashErr) {
      console.error(`[migrations] Failed to compute schema hash: ${hashErr.message}`)
    }

    if (schemaHash) {
      try {
        const storedHash = await this.db
          .prepare(`SELECT value FROM _migration_meta WHERE key = 'schema_hash'`)
          .first('value')
        if (storedHash === schemaHash) {
          console.log(`[migrations] Schema hash matches (${schemaHash.slice(0, 8)}). Skipping migrations.`)
          return
        }
      } catch (err) {
        // If table doesn't exist or other error, run migrations as usual
        console.log(`[migrations] Meta table not found or error reading hash: ${err.message}. Running migrations.`)
      }
    }

    let r = await this.db.prepare('PRAGMA table_list').run()
    // console.log(r)
    let tables = r.results

    for (const clz of this.classes) {
      // console.log("CLASS:", clz)
      let tableName = clz.table || toTableName(clz.name)
      let table = tables.find((t) => t.name === tableName)
      if (!table) {
        await this.createTable(tableName, clz)
      } else {
        await this.checkForChanges(tableName, clz)
      }
    }

    if (schemaHash) {
      try {
        await this.db.prepare(`CREATE TABLE IF NOT EXISTS _migration_meta (key TEXT PRIMARY KEY, value TEXT)`).run()
        await this.db
          .prepare(`INSERT OR REPLACE INTO _migration_meta (key, value) VALUES ('schema_hash', ?)`)
          .bind(schemaHash)
          .run()
        console.log(`[migrations] Schema hash saved: ${schemaHash.slice(0, 8)}`)
      } catch (saveErr) {
        console.error(`[migrations] Failed to save schema hash: ${saveErr.message}`)
      }
    }

    console.log('migrations complete')
  }

  async computeSchemaHash() {
    // 1. Sort classes by their table name or class name to ensure class registration order doesn't affect the hash
    const sortedClasses = [...this.classes].sort((a, b) => {
      const nameA = a.table || a.name || ''
      const nameB = b.table || b.name || ''
      return nameA.localeCompare(nameB)
    })

    const schemaStrings = sortedClasses.map((clz) => {
      // 2. Sort keys of the properties object to ensure property definition order doesn't affect the hash
      const props = clz.properties
        ? JSON.stringify(sortKeys(clz.properties), (key, value) => {
            if (typeof value === 'function') {
              return value.name || value.toString()
            }
            return value
          })
        : ''

      // 3. Sort index configurations to ensure index declaration order doesn't affect the hash
      const indexes = clz.indexes
        ? JSON.stringify(
            clz.indexes
              .map((idx) => {
                if (Array.isArray(idx)) {
                  return idx
                } else if (idx && typeof idx === 'object') {
                  // Sort keys of index option objects (e.g. { columns: [...], unique: true })
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

      return `${clz.table || clz.name}:${props}:${indexes}`
    })

    const combinedSchema = schemaStrings.join('\n')

    // Web Crypto API is globally available in Node.js v15+ and Cloudflare Workers
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : globalThis.crypto
    const msgBuffer = new TextEncoder().encode(combinedSchema)
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    return hashHex
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
    // check if any properties changed and do alter tables if so
    let r = await this.db.prepare(`PRAGMA table_info("${tableName}")`).run()
    // console.log('TABLE INFO:', r)
    let columns = r.results
    for (const propName in clz.properties) {
      let prop = clz.properties[propName]
      // console.log('PROP:', propName, prop)
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
      if (typeof prop.index === 'object' && prop.index.sort) {
        sort = prop.index.sort.toUpperCase()
      } else if (typeof prop.index === 'string' && ['asc', 'desc'].includes(prop.index.toLowerCase())) {
        sort = prop.index.toUpperCase()
      }

      let jsonPath = path.join('.')
      let pathSuffix = path.join('_')
      let indexSuffix = sort ? `_${sort}` : ''
      let indexName = `${tableName}_${colName}_${pathSuffix}${indexSuffix}_idx`
      let stmt = `PRAGMA index_list("${tableName}")`
      let idx = await this.db.prepare(stmt).run()
      let existingIndex = idx.results.find((i) => i.name === indexName)
      if (existingIndex) {
        return
      }
      let colExpr = `json_extract(${colName}, '$.${jsonPath}')`
      if (sort) colExpr += ` ${sort}`
      stmt = `CREATE${prop.index.unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${colExpr})`
      console.log('json index does not exist, creating it', stmt)
      let dr = await this.db.prepare(stmt).run()
      console.log('JSON INDEX CREATED', dr)
    }
  }

  async checkCompositeIndex(tableName, indexDef) {
    let columns = []
    let unique = false
    if (Array.isArray(indexDef)) {
      columns = indexDef
    } else {
      columns = indexDef.columns
      unique = indexDef.unique
    }
    if (!columns || columns.length === 0) return

    let cleanCols = columns.map((col) => col.trim().replace(/[^\w]+/g, '_'))
    let indexName = `${tableName}_${cleanCols.join('_')}_idx`
    let stmt = `PRAGMA index_list("${tableName}")`
    let idx = await this.db.prepare(stmt).run()
    let existingIndex = idx.results.find((i) => i.name === indexName)
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
    stmt = `CREATE${unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${sqlCols.join(', ')})`
    console.log('composite index does not exist, creating it', stmt)
    let dr = await this.db.prepare(stmt).run()
    console.log('COMPOSITE INDEX CREATED', dr)
  }

  async checkForIndex(tableName, propName, prop, col) {
    if (prop.index) {
      // check if there's an index
      // console.log('check indexes')
      let sort = ''
      if (typeof prop.index === 'object' && prop.index.sort) {
        sort = prop.index.sort.toUpperCase()
      } else if (typeof prop.index === 'string' && ['asc', 'desc'].includes(prop.index.toLowerCase())) {
        sort = prop.index.toUpperCase()
      }

      let indexSuffix = sort ? `_${sort}` : ''
      let indexName = `${tableName}_${propName}${indexSuffix}_idx`
      let stmt = `PRAGMA index_list("${tableName}")`
      // console.log(stmt)
      let idx = await this.db.prepare(stmt).run()
      // console.log('INDEXES:', idx)
      let existingIndex = idx.results.find((i) => i.name === indexName)
      if (existingIndex) {
        // console.log('INDEX EXISTS:', existingIndex)
        return
      }
      let columnWithSort = sort ? `${propName} ${sort}` : propName
      stmt = `CREATE${prop.index.unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnWithSort})`
      console.log('index does not exist, creating it', stmt)
      let dr = await this.db.prepare(stmt).run()
      console.log('INDEX CREATED', dr)
    } else {
      // remove index
      // todo: do we want to do this? Or make it more explicit in the model?
      //       like: index: {drop: true}
      // await this.db.prepare(`DROP INDEX ${tableName}_${propName}_idx`).run()
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
