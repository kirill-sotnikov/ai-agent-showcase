import type { PersistedState, Product } from "@shop/shared/contracts";
import { DEFAULT_IDENTITY } from "@shop/shared/defaults";
import { formatMoney } from "@shop/shared/money";
import { useState } from "react";
import * as styles from "../../styles.css";
import { text } from "../../ui/text";
import { useWorkspaceClient } from "../../workspace";
import { ProductForm } from "../catalog/product-form";
import { Icon } from "../ui/icon";
import { ProductTile } from "../ui/product-tile";

export function Settings({
  state,
  disabled,
  act,
}: {
  state: PersistedState;
  disabled: boolean;
  act: (operation: () => Promise<unknown>) => void;
}) {
  const client = useWorkspaceClient();
  const [identity, setIdentity] = useState(state.settings.agentIdentity);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  return (
    <main className={styles.settingsPage}>
      <div className={styles.settingsTitle}>
        <h1>{text.settings}</h1>
      </div>
      {disabled && (
        <p className={styles.notice} role="status">
          {navigator.locks ? text.busy : text.readOnly}
        </p>
      )}
      <section className={`${styles.settingsCard} ${styles.identityCard}`}>
        <div>
          <h2>{text.identityTitle}</h2>
          <p>{text.identityHelp}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();

            act(async () => {
              await client.store.edit((current) => {
                current.settings.agentIdentity =
                  identity.trim() || DEFAULT_IDENTITY;
              });

              setSaved(true);
            });
          }}
        >
          <label htmlFor="identity">{text.identityLabel}</label>
          <textarea
            id="identity"
            value={identity}
            maxLength={2000}
            disabled={disabled}
            onChange={(event) => {
              setIdentity(event.target.value);
              setSaved(false);
            }}
            rows={5}
          />
          <div className={styles.formFooter}>
            <span>{identity.length} / 2,000 characters</span>
            <button className={styles.button} disabled={disabled}>
              {saved ? text.saved : text.identitySave}
            </button>
          </div>
        </form>
      </section>
      <section className={`${styles.settingsCard} ${styles.catalogCard}`}>
        <div className={styles.catalogHeader}>
          <div>
            <h2>
              {text.products}
              <span className={styles.count}>{state.products.length}</span>
            </h2>
            <p>{text.catalogHelp}</p>
          </div>
          <button
            className={styles.button}
            disabled={disabled || state.products.length >= 200}
            onClick={() => setEditing("new")}
          >
            <Icon name="plus" size={17} />
            {text.addProduct}
          </button>
        </div>
        {editing && (
          <ProductForm
            key={editing === "new" ? "new" : editing.id}
            product={editing === "new" ? null : editing}
            disabled={disabled}
            onCancel={() => setEditing(null)}
            onSave={(product) =>
              act(async () => {
                await client.store.saveProduct(product);
                setEditing(null);
              })
            }
          />
        )}
        {state.products.length === 0 ? (
          <div className={styles.settingsEmpty}>
            <h3>{text.noProducts}</h3>
            <p>{text.noProductsHelp}</p>
          </div>
        ) : (
          <div className={styles.catalogList}>
            {state.products.map((product) => (
              <article
                data-testid="catalog-item"
                className={styles.catalogItem}
                key={product.id}
              >
                <ProductTile product={product} />
                <div className={styles.catalogItemInfo}>
                  <span className={styles.eyebrow}>
                    {product.category || "PRODUCT"}
                  </span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className={styles.attributeTags}>
                    {Object.entries(product.attributes).map(([key, value]) => (
                      <span key={key}>
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                </div>
                <strong>{formatMoney(product.priceMinor)}</strong>
                <div className={styles.catalogActions}>
                  <button
                    className={styles.textButton}
                    disabled={disabled}
                    onClick={() => setEditing(product)}
                  >
                    {text.edit}
                  </button>
                  <button
                    className={`${styles.textButton} ${styles.danger}`}
                    disabled={disabled}
                    onClick={() => {
                      if (
                        confirm(
                          state.cart.items.some(
                            (item) => item.productId === product.id,
                          )
                            ? text.deleteCartConfirm
                            : text.deleteConfirm,
                        )
                      )
                        act(() => client.store.deleteProduct(product.id));
                    }}
                  >
                    {text.delete}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className={styles.settingsFooter}>
        Your workspace lives in this browser. No account, database, or checkout.
        <button
          className={`${styles.textButton} ${styles.danger}`}
          disabled={disabled}
          onClick={() => {
            if (confirm(text.resetConfirm)) void client.reset();
          }}
        >
          {text.reset}
        </button>
      </footer>
    </main>
  );
}
