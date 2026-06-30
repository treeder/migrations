import { assert } from 'testkit'

export async function test1(c) {

  console.log("Running test1")
  let r = await c.api.fetch(`/?clear=true`, {
    method: 'POST',
    body: {
    },
  })
  console.log('r1:', r)
  await new Promise(resolve => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {
    },
  })
  console.log('r2:', r)
  assert(r.tables)
  assert(r.indexes)
  assert(r.productsTable)
  assert(r.productsTable.length > 0)
  assert(r.productsTable.some(p => p.name == 'categoryId'))
  assert(r.indexes.length == 5) // primary key autoindex + 2 compound indexes + 1 single sorted + 1 compound sorted
  await new Promise(resolve => setTimeout(resolve, 10000))

  // verify compound indexes
  assert(r.indexes.some(i => i.name === 'products_categoryId_name_idx'))
  assert(r.indexes.some(i => i.name === 'products_name_value_idx' && i.unique === 1))

  // verify sorted indexes
  assert(r.indexes.some(i => i.name === 'products_price_DESC_idx'))
  assert(r.indexes.some(i => i.name === 'products_quantity_DESC_updatedAt_ASC_idx'))

  // now let's add an index and make sure it updates
  r = await c.api.fetch(`/?addIndex=true`, {
    method: 'POST',
    body: {
    },
  })
  console.log('r3:', r)
  await new Promise(resolve => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {
    },
  })
  console.log('r4:', r)
  assert(r.indexes.length == 6) // autoindex, 3 compound, 2 regular

  // composite indexes on existing tables (checkForChanges) — add a new compound index
  r = await c.api.fetch(`/?addCompositeIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r5:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r6:', r)
  assert(r.indexes.length == 7) // autoindex, 4 compound, 2 regular
  assert(r.indexes.some((i) => i.name === 'products_categoryId_value_idx'))
}
