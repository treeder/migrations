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
    console.log('migrations complete')
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
    }
    if (clz.indices) {
      for (const index of clz.indices) {
        await this.checkForIndex(tableName, index.fields, { index: { unique: index.unique } })
      }
    }
  }

  async checkForIndex(tableName, propName, prop, col) {
    if (prop.index) {
      if (typeof propName == 'string' || propName instanceof String) {
        propName = [propName]
      }
      let indexName = `${tableName}_${propName.join('_')}_idx`
      let stmt = `PRAGMA index_list("${tableName}")`
      let idx = await this.db.prepare(stmt).run()
      let existingIndex = idx.results.find((i) => i.name === indexName)
      if (existingIndex) {
        return
      }
      stmt = `CREATE${prop.index.unique ? ' UNIQUE' : ''} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${propName.join(', ')})`
      console.log('index does not exist, creating it', stmt)
      let dr = await this.db.prepare(stmt).run()
      console.log(`index ${indexName} created`, dr)
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
