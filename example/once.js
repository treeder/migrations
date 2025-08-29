import { ClassMigrations } from '../cmigrations.js'
import { Product } from './models/product.js'

let finished

export async function once(func, c) {
  if (finished) return finished
  console.log('once')
  finished = func(c)
  return finished
}

export async function init(c) {
  let migrations = new ClassMigrations(c.env.D1, [Product])
  await migrations.run()
}