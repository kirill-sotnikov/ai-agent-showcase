import type { Product } from "@shop/shared/contracts";
import { DomainError } from "@shop/shared/domain";

export function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export class CatalogService {
  constructor(readonly products: Product[]) {}

  get(productId: string) {
    const product = this.products.find((product) => product.id === productId);

    if (!product)
      throw new DomainError("PRODUCT_NOT_FOUND", "Product not found.");

    return product;
  }

  search(
    query: string,
    category: string | null = null,
    maxPriceMinor: number | null = null,
    limit = 10,
  ) {
    const tokens = normalize(query)
      .split(" ")
      .filter(Boolean)
      .map((token) => token.replace(/s$/, ""));

    return this.products
      .filter((product) => {
        const text = normalize(
          [
            product.name,
            product.description,
            product.category,
            ...Object.values(product.attributes),
          ].join(" "),
        );

        return (
          tokens.every((token) => text.includes(token)) &&
          (!category || normalize(product.category) === normalize(category)) &&
          (maxPriceMinor === null || product.priceMinor <= maxPriceMinor)
        );
      })
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, Math.min(10, limit));
  }

  cheapest(products: Product[]) {
    return [...products].sort(
      (left, right) =>
        left.priceMinor - right.priceMinor || left.id.localeCompare(right.id),
    )[0];
  }
}
