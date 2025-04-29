export class Product {
  static properties = {
    id: {
      type: String,
      primaryKey: true,
    },
    createdAt: {
      type: Date,
    },
    updatedAt: {
      type: Date,
    },
    name: {
      type: String,
    },
    value: {
      type: Number,
    },
    price: {
      type: Number,
    },
    description: {
      type: String,
    },
    quantity: {
      type: Number,
    },
  }
}