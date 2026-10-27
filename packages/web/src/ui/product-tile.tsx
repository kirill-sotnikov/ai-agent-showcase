import type { Product } from "@shop/contracts";
import { Icon } from "./icon";

export function ProductTile({ product }: { product: Product }) {
  const category = product.category.toLowerCase();

  return (
    <div
      className={`product-tile ${category.includes("light") ? "sage" : category.includes("audio") ? "lavender" : "sand"}`}
      aria-hidden="true"
    >
      {category.includes("light") ? (
        <svg viewBox="0 0 60 60">
          <path d="M21 23h18l7 16H14l7-16ZM30 39v12M21 51h18M30 13v10" />
        </svg>
      ) : category.includes("audio") ? (
        <svg viewBox="0 0 60 60">
          <path d="M15 37V28a15 15 0 0 1 30 0v9M15 31h7v16h-7zM38 31h7v16h-7z" />
        </svg>
      ) : category.includes("kitchen") ? (
        <svg viewBox="0 0 60 60">
          <path d="M15 23h27v17a10 10 0 0 1-10 10h-7a10 10 0 0 1-10-10V23ZM42 27h5a7 7 0 0 1 0 14h-5M23 12v5m10-5v5" />
        </svg>
      ) : (
        <Icon name="bag" size={34} />
      )}
    </div>
  );
}
