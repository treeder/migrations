# migrations

Simple SQLite migration library library. 

This works with Cloudflare D1 out of the box. 

### Usage

```sh
npm install treeder/migrations
# OR
bun install treeder/migrations
```

### Using raw statements

```js
import { Migrations } from 'migrations'

let migrations = new Migrations(db) 
// add all your migrations, one statement per add()
// WARNING: DO NOT REMOVE A MIGRATION, EVER! JUST LEAVE THEM AND ADD TO THE LIST
migrations.add(`CREATE TABLE IF NOT EXISTS mytable (id string PRIMARY KEY, createdAt text)`)
migrations.add(`CREATE TABLE IF NOT EXISTS mytable2 (id string PRIMARY KEY, createdAt text)`)

// Then run it. You can run this any number of times, it will only run each migration once.
await migrations.run()
```

### Using classes

Define a class with properties. Properties are just like Lit component properties so they have a similar feel.

```js
import { ClassMigrations } from 'migrations'

// First define your models as classes:
export class Product {
  static properties = {
    id: {
      type: String,
      primaryKey: true,
    },
    createdAt: {
      type: Date,
    },
    name: {
      type: String,
    },
    price: {
      type: Number,
    },
  }
}

// Then use this to create your migrations:
let migrations = new Migrations2(env.D1, [
  Product,
])
await migrations.run()
```

If you add new properties, the database will automatically update on the next run.
