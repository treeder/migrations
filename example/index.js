import { ClassMigrations, toTableName } from "../cmigrations.js"
import { Product } from "./models/product.js"

export default {
  async fetch(request, env, ctx) {

    let migrations = new ClassMigrations(env.D1, [
      Product,
    ])
    await migrations.run()

    let r = await env.D1.prepare("PRAGMA table_list").run()
    console.log(r)
    let tables = r.results
    r = await env.D1.prepare(`PRAGMA table_info("${toTableName(Product.name)}")`).run()
    console.log(r)
    return Response.json({ tables, products: r.results, })
  },
}