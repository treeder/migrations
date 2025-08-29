import { ClassMigrations, toTableName } from '../cmigrations.js'
import { Product } from './models/product.js'
import { init, once } from './once.js'

export default {
  async fetch(request, env, ctx) {
    try {

      let tableName = toTableName(Product.name)
      let { searchParams } = new URL(request.url)
      if (searchParams.get('clear')) {
        console.log("clear")
        await env.D1.prepare(`DROP TABLE IF EXISTS ${tableName}`).run()
        return Response.json({ message: 'Table dropped' })
      }
      if (searchParams.get('addIndex')) {
        Product.properties.categoryId.index = true
      }
      await init({ env })

      let r = await env.D1.prepare('PRAGMA table_list').run()
      // console.log('TABLES:', r)
      let tables = r.results
      r = await env.D1.prepare(`PRAGMA table_info("${tableName}")`).run()
      // console.log(tableName, 'XXX COLUMNS:', r)
      let idx = await env.D1.prepare(`PRAGMA index_list("${tableName}")`).run()
      // console.log('abc INDEXES:', idx)
      return Response.json({ tables, productsTable: r.results, indexes: idx.results })
    } catch (err) {
      console.error(err)
      throw err
    }

  },
}
