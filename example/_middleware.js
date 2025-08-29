import { once } from "./once.js"

export async function onRequest(c) {
  console.log("MIDDLEWARE")
  try {

    await once(c)
    return await c.next()

  } catch (err) {
    console.error(err)
    throw err
  }
}