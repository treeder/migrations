import { ClassMigrations, toTableName } from '../cmigrations.js'
import { Product } from './models/product.js'

export default {
  async fetch(request, env, ctx) {
    try {
      let migrations = new ClassMigrations(env.D1, [Product])
      await migrations.run()
    } catch (e) {
      console.error(e)
    }

    let r = await env.D1.prepare('PRAGMA table_list').run()
    // console.log('TABLES:', r)
    let tables = r.results
    let tableName = toTableName(Product.name)
    r = await env.D1.prepare(`PRAGMA table_info("${tableName}")`).run()
    // console.log(tableName, 'XXX COLUMNS:', r)
    return Response.json({ tables, products: r.results })
  },
}
