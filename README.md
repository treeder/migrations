# migrations

Simple SQLite migration library.

This works with Cloudflare D1 out of the box.

This will perform the migration and since it's in git, it will also keep a record of all db changes.

## Usage

```sh
npm install treeder/migrations
```

## Using classes

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
    data: {
      type: Object, // Use Object for JSON fields.
    },
  }
}
```

Then run the migrations:

```js
// Then use this to create your migrations:
let migrations = new ClassMigrations(env.D1, [Product])
await migrations.run()
```

If you add new properties, the database will automatically update on the next time you run it.

### Ensure you only run it once on startup

Use this once function:

```

```

### Indexes

Add an index property to the field.

```js
{
  userId: {
    type: String,
    index: true,
  },
}
```

To make it a unique index:

```js
{
  userId: {
    type: String,
    index: {
      unique: true,
    },
  },
}
```

#### Composite / Compound Indexes

You can also define composite indexes (or multi-column indexes) on your model by adding an `indexes` static property array. This is useful when you want to create an index across multiple fields.

```js
export class Product {
  static properties = {
    tenantId: { type: String },
    categoryId: { type: String },
    name: { type: String },
  }

  static indexes = [
    // Array syntax for standard composite index
    ['tenantId', 'categoryId'],
    // Object syntax if you need it to be unique
    { columns: ['tenantId', 'name'], unique: true }
  ]
}
```

## Using raw statements

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
