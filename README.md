# migrations

Simple SQLite migration library with declarative schemas and arbitrary data migrations.

This works with Cloudflare D1 out of the box.

- **Fast startup**: Uses an in-memory SHA-256 schema hash to skip all inspection queries on cold starts.
- **Declarative schemas**: Define models as classes with properties and indexes; tables and columns are automatically created and updated.
- **Arbitrary migrations**: Run custom SQL queries, data backfills, and async JS functions that are guaranteed to run only once using content hashing.

## Usage

```sh
npm install treeder/migrations
```

## Using Models (Declarative Schemas)

Define a class with properties. Properties are just like Lit component properties so they have a similar feel.

```js
import { Migrations } from 'migrations'

// Define your models as classes:
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
let migrations = new Migrations(env.D1, [Product])
await migrations.run()
```

If you add new properties or indexes to your classes, the database will automatically update the next time you run it.

### Indexes

Add an `index` property to any field:

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

Define composite indexes by adding an `indexes` static property array to your model:

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

Create partial indexes by specifying a `where` predicate clause. This is supported on single property indexes, JSON sub-field indexes, and composite indexes:

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

---

## Arbitrary Migrations & Data Updates

You can execute arbitrary database queries (such as `UPDATE`, `INSERT`, data backfills, or custom JavaScript logic) alongside your models. Each arbitrary migration is tracked by its content hash in SQLite (`_migrations` table) to ensure it **only runs once**.

### 1. Co-located on Model Classes

Add a `static migrations` array to your model class:

```js
export class Product {
  static properties = {
    id: { type: String, primaryKey: true },
    status: { type: String },
  }

  static migrations = [
    // SQL string migration (content hash tracked automatically)
    `UPDATE products SET status = 'active' WHERE status IS NULL`,

    // Object with custom identifier and SQL or async JS function
    {
      id: 'backfill-product-status',
      up: `UPDATE products SET status = 'pending' WHERE status = 'draft'`,
    },
  ]
}
```

### 2. Standalone Arbitrary Migrations

You can also pass arbitrary migrations directly to `Migrations`:

```js
import { Migrations } from 'migrations'
import { Product, User } from './models.js'

let migrations = new Migrations(env.D1, [
  Product,
  User,

  // Raw SQL string
  `UPDATE users SET role = 'member' WHERE role IS NULL`,

  // Migration object with async JS function
  {
    id: 'seed-admin-user',
    up: async (db) => {
      await db.prepare(`INSERT OR IGNORE INTO users (id, role) VALUES ('admin', 'superadmin')`).run()
    }
  }
])

await migrations.run()
```

Or add them dynamically with `migrations.add(...)`:

```js
let migrations = new Migrations(env.D1)
migrations.add(Product)
migrations.add(`UPDATE settings SET initialized = 1 WHERE initialized IS NULL`)
await migrations.run()
```
