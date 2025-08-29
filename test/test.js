// import 'dotenv/config'
import { API } from 'api'
import { assert, TestKit } from 'testkit'
import { test1 } from './test1.js'

console.log("ENV:", process.env.YO)
let apiURL = 'http://localhost:8787'
let api = new API({
  apiURL,
  // set any auth headers and things here
  headers: {
    Authorization: `apiKey ${process.env.API_KEY}`,
  },
})
let c = {
  env: process.env,
  api,
}

let tests = [test1]
let testKit = new TestKit(c, tests)
await testKit.run()

console.log('done')