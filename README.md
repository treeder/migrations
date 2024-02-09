# migrations

Simple JS database/SQL migration library. 

This works with Cloudflare D1 out of the box. 

### Usage

```sh
npm install treeder/migrations
# OR
bun install treeder/migrations
```

```js
import {Migrations} from 'migrations'

let migrations = new Migrations(db) 
// add all your migrations
// WARNING: DO NOT REMOVE A MIGRATION, EVER! JUST LEAVE THEM AND ADD TO THE LIST
migrations.add(`CREATE TABLE IF NOT EXISTS mytable (id string PRIMARY KEY, createdAt text)`)
migrations.add(`CREATE TABLE IF NOT EXISTS mytable2 (id string PRIMARY KEY, createdAt text)`)

// Then run it. You can run this any number of times, it will only run each migration once.
await migrations.run()
```
