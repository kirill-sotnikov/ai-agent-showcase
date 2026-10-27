import type { Product } from "./contracts/index.js";

export const DEFAULT_IDENTITY =
  "You are a helpful shopping assistant. Help customers discover products, understand their features, compare suitable options, and build their cart. Be concise, friendly, and clear. Use only the provided product catalog.";
export const seedProducts: Product[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Arc Desk Lamp",
    description:
      "An adjustable reading lamp with a warm LED light and a matte finish.",
    priceMinor: 3900,
    currency: "USD",
    category: "Lighting",
    attributes: { color: "Sage", material: "Aluminum", power: "8 W" },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Linen Table Lamp",
    description:
      "Soft ambient lighting with a natural linen shade and ceramic base.",
    priceMinor: 4800,
    currency: "USD",
    category: "Lighting",
    attributes: { color: "Sand", material: "Ceramic" },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Blue Ceramic Mug",
    description:
      "A comfortable everyday mug, dishwasher safe, with a glazed blue finish.",
    priceMinor: 1800,
    currency: "USD",
    category: "Kitchen",
    attributes: { color: "Blue", capacity: "350 ml" },
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Cloud Wireless Headphones",
    description:
      "Lightweight wireless headphones with noise isolation and USB-C charging.",
    priceMinor: 8900,
    currency: "USD",
    category: "Audio",
    attributes: {
      color: "Black",
      battery: "30 hours",
      connectivity: "Bluetooth",
    },
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Studio Wireless Headphones",
    description: "Over-ear wireless headphones with active noise cancellation.",
    priceMinor: 12900,
    currency: "USD",
    category: "Audio",
    attributes: {
      color: "Silver",
      battery: "40 hours",
      connectivity: "Bluetooth",
    },
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Canvas Everyday Tote",
    description: "A durable cotton canvas tote with an inside pocket.",
    priceMinor: 2400,
    currency: "USD",
    category: "Accessories",
    attributes: { color: "Natural", material: "Cotton" },
  },
];
