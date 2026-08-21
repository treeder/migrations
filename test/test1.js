import { assert } from 'testkit'

export async function test1(c) {
  console.log('Running test1')
  let r = await c.api.fetch(`/?clear=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r1:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r2:', r)
  assert(r.tables)
  assert(r.indexes)
  assert(r.productsTable)
  assert(r.productsTable.length > 0)
  assert(r.productsTable.some((p) => p.name == 'categoryId'))
  assert(r.indexes.length == 7) // primary key autoindex + 3 compound indexes + 1 single sorted + 2 JSON sub-field indexes
  await new Promise((resolve) => setTimeout(resolve, 10000))

  // verify compound indexes
  assert(r.indexes.some((i) => i.name === 'products_categoryId_name_idx'))
  assert(r.indexes.some((i) => i.name === 'products_name_value_idx' && i.unique === 1))

  // verify sorted indexes
  assert(r.indexes.some((i) => i.name === 'products_price_DESC_idx'))
  assert(r.indexes.some((i) => i.name === 'products_quantity_DESC_updatedAt_ASC_idx'))

  // verify JSON sub-field indexes
  assert(r.indexes.some((i) => i.name === 'products_data_brand_idx'))
  assert(r.indexes.some((i) => i.name === 'products_data_rating_DESC_idx'))

  // now let's add an index and make sure it updates
  r = await c.api.fetch(`/?addIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r3:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r4:', r)
  assert(r.indexes.length == 8) // autoindex, 3 compound, 2 regular/sorted, 2 JSON

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
  assert(r.indexes.length == 9) // autoindex, 4 compound, 2 regular/sorted, 2 JSON
  assert(r.indexes.some((i) => i.name === 'products_categoryId_value_idx'))

  // JSON sub-field indexes on existing tables (checkForChanges) — add a new JSON sub-field index
  r = await c.api.fetch(`/?addJsonIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r7:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r8:', r)
  assert(r.indexes.length == 10) // autoindex, 4 compound, 2 regular/sorted, 3 JSON
  assert(r.indexes.some((i) => i.name === 'products_data_tag_idx'))

  // Single partial index on existing tables
  r = await c.api.fetch(`/?addPartialIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r9:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r10:', r)
  assert(r.indexes.length == 11)
  assert(r.indexes.some((i) => i.name === 'products_description_idx'))

  // Composite partial index with custom name
  r = await c.api.fetch(`/?addPartialCompositeIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r11:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r12:', r)
  assert(r.indexes.length == 12)
  assert(r.indexes.some((i) => i.name === 'products_active_category_price_idx'))

  // JSON sub-field partial index
  r = await c.api.fetch(`/?addPartialJsonIndex=true`, {
    method: 'POST',
    body: {},
  })
  console.log('r13:', r)
  await new Promise((resolve) => setTimeout(resolve, 10000))

  r = await c.api.fetch(`/`, {
    method: 'POST',
    body: {},
  })
  console.log('r14:', r)
  assert(r.indexes.length == 13)
  assert(r.indexes.some((i) => i.name === 'products_data_status_idx'))
}
