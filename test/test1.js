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
  assert(r.indexes.length == 1)
  await new Promise(resolve => setTimeout(resolve, 10000))

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
  assert(r.indexes.length == 2)

}