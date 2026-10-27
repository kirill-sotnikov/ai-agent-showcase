import { useState } from "react";
import type { PersistedState, Product } from "@shop/contracts";
import { DEFAULT_IDENTITY, formatMoney } from "@shop/domain";
import { client } from "../workspace";
import { Icon } from "../ui/icon";
import { ProductTile } from "../ui/product-tile";
import { ProductForm } from "../features/catalog/product-form";
import { text } from "../ui/text";

export function Settings({
  state,
  disabled,
  act,
}: {
  state: PersistedState;
  disabled: boolean;
  act: (operation: () => Promise<unknown>) => void;
}) {
  const [identity, setIdentity] = useState(state.settings.agentIdentity);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  return (
    <main className="settings-page">
      <div className="settings-title">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h1>{text.settings}</h1>
        <p>Shape your assistant. Curate your catalog.</p>
      </div>
      {disabled && (
        <p className="notice" role="status">
          {navigator.locks ? text.busy : text.readOnly}
        </p>
      )}
      <section className="settings-card identity-card">
        <div>
          <span className="section-number">01</span>
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
          <div className="form-footer">
            <span>{identity.length} / 2,000 characters</span>
            <button className="button" disabled={disabled}>
              {saved ? text.saved : text.identitySave}
            </button>
          </div>
        </form>
      </section>
      <section className="settings-card catalog-card">
        <div className="catalog-header">
          <div>
            <span className="section-number">02</span>
            <h2>
              {text.products}
              <span className="count">{state.products.length}</span>
            </h2>
            <p>{text.catalogHelp}</p>
          </div>
          <button
            className="button"
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
          <div className="settings-empty">
            <h3>{text.noProducts}</h3>
            <p>{text.noProductsHelp}</p>
          </div>
        ) : (
          <div className="catalog-list">
            {state.products.map((product) => (
              <article className="catalog-item" key={product.id}>
                <ProductTile product={product} />
                <div className="catalog-item-info">
                  <span className="eyebrow">
                    {product.category || "PRODUCT"}
                  </span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="attribute-tags">
                    {Object.entries(product.attributes).map(([key, value]) => (
                      <span key={key}>
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                </div>
                <strong>{formatMoney(product.priceMinor)}</strong>
                <div className="catalog-actions">
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() => setEditing(product)}
                  >
                    {text.edit}
                  </button>
                  <button
                    className="text-button danger"
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
      <footer className="settings-footer">
        Your workspace lives in this browser. No account, database, or checkout.
        <button
          className="text-button danger"
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
