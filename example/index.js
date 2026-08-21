import { ClassMigrations, toTableName } from '../cmigrations.js'
import { Product } from './models/product.js'
import { init, once } from './once.js'

export default {
  async fetch(request, env, ctx) {
    try {
      let tableName = toTableName(Product.name)
      let { searchParams } = new URL(request.url)
      if (searchParams.get('clear')) {
        console.log('clear')
        await env.D1.prepare(`DROP TABLE IF EXISTS ${tableName}`).run()
        await env.D1.prepare(`DROP TABLE IF EXISTS _migration_meta`).run()
        return Response.json({ message: 'Table dropped' })
      }
      if (searchParams.get('addIndex')) {
        Product.properties.categoryId.index = true
      }
      if (searchParams.get('addCompositeIndex')) {
        Product.indexes.push(['categoryId', 'value'])
      }
      if (searchParams.get('addJsonIndex')) {
        Product.properties.data.tag = { type: String, index: true }
      }
      if (searchParams.get('addPartialIndex')) {
        Product.properties.description.index = { where: 'description IS NOT NULL' }
      }
      if (searchParams.get('addPartialCompositeIndex')) {
        Product.indexes.push({
          columns: ['categoryId', 'price'],
          where: 'price > 0',
          name: 'products_active_category_price_idx',
        })
      }
      if (searchParams.get('addPartialJsonIndex')) {
        Product.properties.data.status = {
          type: String,
          index: { where: "json_extract(data, '$.status') != 'archived'" },
        }
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
