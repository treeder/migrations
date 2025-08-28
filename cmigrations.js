/**
 * The object oriented version
 */
export class ClassMigrations {
  // Putting this as static so this doesn't run multiple times by accident
  static finished = null

  constructor(db, classes = []) {
    this.db = db
    this.classes = classes
    // this.finished = null
  }

  add(clz) {
    this.classes.push(clz)
  }

  async run() {
    if (ClassMigrations.finished) return ClassMigrations.finished
    ClassMigrations.finished = this.run2()
  }

  async run2() {
    console.log('run')
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
    for (const prop in clz.properties) {
      let p = clz.properties[prop]
      stmt += `${prop} ${this.toSQLiteType(p.type)}`
      if (p.primaryKey) stmt += ' PRIMARY KEY'
      stmt += ','
    }
    stmt = stmt.slice(0, -1)
    stmt += ')'
    console.log(stmt)
    await this.db.prepare(stmt).run()
  }

  async checkForChanges(tableName, clz) {
    // check if any properties changed and do alter tables if so
    let r = await this.db.prepare(`PRAGMA table_info("${tableName}")`).run()
    console.log('TABLE:', r)
    let columns = r.results
    for (const propName in clz.properties) {
      let prop = clz.properties[propName]
      console.log('PROP:', propName, prop)
      let col = columns.find((c) => c.name === propName)
      if (col) {
        await this.checkForIndex(tableName, propName, prop, col)
        continue
      }
      let stmt = `ALTER TABLE ${tableName} ADD COLUMN `
      stmt += `${propName} ${this.toSQLiteType(prop.type)}`
      if (prop.primaryKey) stmt += ' PRIMARY KEY'
      console.log(stmt)
      await this.db.prepare(stmt).run()
    }
  }

  async checkForIndex(tableName, propName, prop, col) {
    if (prop.index) {
      // check if there's an index
      console.log('check indexes')
      try {
        let stmt = `PRAGMA index_list("${tableName}")`
        console.log(stmt)
        let idx = await this.db.prepare(stmt).run()
        console.log('INDEXES:', idx)
      } catch (e) {
        console.log(e)
      }
      console.log('AAAAAA')
      // await this.db
      //   .prepare(
      //     `CREATE ${
      //       prop.index.unique ? 'UNIQUE' : ''
      //     } INDEX ${tableName}_${propName}_idx ON ${tableName} (${propName})`
      //   )
      //   .run()
      console.log('INDEX CREATED')
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
