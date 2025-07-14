/**
 * The object oriented version
 */

let runCount = 0

export class ClassMigrations {

  constructor(db, classes = []) {
    this.db = db
    this.classes = classes
  }

  add(clz) {
    this.classes.push(clz)
  }

  async run() {
    if (runCount > 0) return
    runCount++

    let r = await this.db.prepare("PRAGMA table_list").run()
    // console.log(r)
    let tables = r.results

    for (const clz of this.classes) {
      // console.log("CLASS:", clz)
      let tableName = clz.table || toTableName(clz.name)
      let table = tables.find(t => t.name === tableName)
      if (!table) {
        console.log(`CREATING TABLE ${tableName}`)
        let stmt = `CREATE TABLE ${tableName} (`
        for (const prop in clz.properties) {
          let p = clz.properties[prop]
          stmt += `${prop} ${this.toSQLiteType(p.type)}`
          if (p.primaryKey) stmt += " PRIMARY KEY"
          stmt += ","
        }
        stmt = stmt.slice(0, -1)
        stmt += ")"
        console.log(stmt)
        await this.db.prepare(stmt).run()
      } else {
        // check if any properties changed and do alter tables if so
        let r = await this.db.prepare(`PRAGMA table_info("${tableName}")`).run()
        // console.log(r)
        let columns = r.results
        for (const prop in clz.properties) {
          console.log("prop:", prop)
          if (columns.find(c => c.name === prop)) {
            continue
          }
          let stmt = `ALTER TABLE ${tableName} ADD COLUMN `
          let p = clz.properties[prop]
          stmt += `${prop} ${this.toSQLiteType(p.type)}`
          if (p.primaryKey) stmt += " PRIMARY KEY"
          console.log(stmt)
          await this.db.prepare(stmt).run()
        }
      }
    }

  }

  toSQLiteType(type) {
    switch (type) {
      case String:
        return "TEXT"
      case Number:
        return "NUMERIC"
      case Boolean:
        return "INTEGER"
      case Date:
        return "TEXT"
      case BigInt:
        return "TEXT"
      case Object:
        return "TEXT"
      case Array:
        return "TEXT"
      default:
        return "TEXT"
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
  return str + "s"
}
