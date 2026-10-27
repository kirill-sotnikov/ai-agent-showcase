import * as styles from "../../styles.css";
import { useState } from "react";
import { productSchema, type Product } from "@shop/shared/contracts";
import { text } from "../../ui/text";

export function ProductForm({
  product,
  disabled,
  onSave,
  onCancel,
}: {
  product: Product | null;
  disabled: boolean;
  onSave: (product: Product) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");

  return (
    <form
      className={styles.productForm}
      onSubmit={(event) => {
        event.preventDefault();

        const data = new FormData(event.currentTarget);
        const rawPrice = String(data.get("price"));

        try {
          if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(rawPrice)) throw new Error();

          const [whole, fraction = ""] = rawPrice.split(".");

          const attributes = Object.fromEntries(
            String(data.get("attributes"))
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => {
                const separator = line.indexOf(":");

                if (separator < 1) throw new Error();

                return [
                  line.slice(0, separator).trim(),
                  line.slice(separator + 1).trim(),
                ];
              }),
          );

          const parsed = productSchema.parse({
            id: product?.id ?? crypto.randomUUID(),
            name: data.get("name"),
            description: data.get("description"),
            priceMinor: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
            currency: "USD",
            category: data.get("category"),
            attributes,
          });

          onSave(parsed);
        } catch {
          setError(text.productError);
        }
      }}
    >
      <h3>{product ? text.editProduct : text.addProduct}</h3>
      <fieldset disabled={disabled}>
        <div className={styles.formGrid}>
          <label>
            {text.name}
            <input
              name="name"
              defaultValue={product?.name}
              maxLength={120}
              required
            />
          </label>
          <label>
            {text.price}
            <input
              name="price"
              inputMode="decimal"
              defaultValue={
                product ? (product.priceMinor / 100).toFixed(2) : ""
              }
              placeholder="0.00"
              required
            />
          </label>
          <label className={styles.fullWidth}>
            {text.description}
            <textarea
              name="description"
              rows={2}
              maxLength={2000}
              defaultValue={product?.description}
            />
          </label>
          <label>
            {text.category}
            <input
              name="category"
              maxLength={80}
              defaultValue={product?.category}
            />
          </label>
          <label>
            {text.attributes}
            <textarea
              name="attributes"
              aria-label={text.attributes}
              rows={2}
              defaultValue={Object.entries(product?.attributes ?? {})
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
            />
            <small>{text.attributesHelp}</small>
          </label>
        </div>
        {error && (
          <p role="alert" className={styles.fieldError}>
            {error}
          </p>
        )}
        <div className={styles.formButtons}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={onCancel}
          >
            {text.cancel}
          </button>
          <button className={styles.button}>{text.save}</button>
        </div>
      </fieldset>
    </form>
  );
}
