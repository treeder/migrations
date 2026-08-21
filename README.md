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

#### JSON Sub-Field Indexes

You can add indexes to sub-fields inside `Object` (JSON) properties. This creates an SQLite expression index using `json_extract()`.

```js
export class Product {
  static properties = {
    id: { type: String, primaryKey: true },
    data: {
      type: Object,
      brand: {
        type: String,
        index: true, // creates index on json_extract(data, '$.brand')
      },
      rating: {
        type: Number,
        index: 'DESC', // creates sorted index on json_extract(data, '$.rating') DESC
      },
      sku: {
        type: String,
        index: { unique: true }, // creates UNIQUE index on json_extract(data, '$.sku')
      },
      specs: {
        type: Object,
        color: {
          type: String,
          index: true, // creates index on json_extract(data, '$.specs.color')
        },
      },
    },
  }
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
    { columns: ['tenantId', 'name'], unique: true },
    // Composite index combining JSON sub-field and regular column
    ['data.brand', 'name'],
  ]
}
```

#### Partial Indexes

You can create partial indexes by specifying a `where` predicate clause. This is supported on single property indexes, JSON sub-field indexes, and composite indexes. You can also optionally provide a custom `name`.

```js
export class Product {
  static properties = {
    id: { type: String, primaryKey: true },
    email: {
      type: String,
      // Unique index on active (non-deleted) emails only
      index: { unique: true, where: 'deletedAt IS NULL' },
    },
    status: {
      type: String,
      // Partial index with custom name
      index: { where: 'status != "archived"', name: 'idx_active_status' },
    },
    data: {
      type: Object,
      inventory: {
        type: Number,
        // Partial index on JSON sub-field
        index: { where: "json_extract(data, '$.inventory') > 0" },
      },
    },
    deletedAt: { type: Date },
  }

  static indexes = [
    // Composite partial index
    {
      columns: ['tenantId', 'name'],
      where: 'deletedAt IS NULL',
    },
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
