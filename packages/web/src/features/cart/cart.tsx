import type { PersistedState } from "@shop/shared/contracts";
import { cartTotal } from "@shop/shared/domain";
import { formatMoney } from "@shop/shared/money";
import { client } from "../../workspace";
import { Icon } from "../../ui/icon";
import { ProductTile } from "../../ui/product-tile";
import { text } from "../../ui/text";

export function Cart({
  state,
  disabled,
  act,
  pending,
}: {
  state: PersistedState;
  disabled: boolean;
  act: (operation: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const count = state.cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="panel cart-panel" aria-label="Cart">
      <div className="compact-heading">
        <div className="heading-label">
          <Icon name="bag" />
          <h2>{text.cart}</h2>
          <span className="count">{count}</span>
        </div>
        <span className="muted small">{state.settings.currency}</span>
      </div>
      <div className="cart-scroll">
        {state.cart.items.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-illustration">
              <Icon name="bag" size={38} />
            </div>
            <h3>{text.emptyCart}</h3>
            <p>{text.emptyCartBody}</p>
          </div>
        ) : (
          state.cart.items.map((item) => {
            const product = state.products.find(
              (product) => product.id === item.productId,
            )!;

            return (
              <article key={item.productId} className="cart-item">
                <ProductTile product={product} />
                <div className="cart-item-main">
                  <span className="eyebrow">
                    {product.category || "PRODUCT"}
                  </span>
                  <h3>{product.name}</h3>
                  <span className="small muted">
                    {formatMoney(product.priceMinor)} each
                  </span>
                  <div className="quantity-row">
                    <div className="stepper">
                      <button
                        disabled={disabled}
                        aria-label={`Decrease ${product.name} quantity`}
                        onClick={() =>
                          act(() =>
                            client.store.setQuantity(
                              product.id,
                              item.quantity - 1,
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        key={`${product.id}-${item.quantity}`}
                        aria-label={`${product.name} quantity`}
                        defaultValue={item.quantity}
                        type="number"
                        min={0}
                        max={99}
                        disabled={disabled}
                        onBlur={(event) => {
                          const value = event.target.value;

                          if (
                            value !== "" &&
                            Number.isInteger(Number(value)) &&
                            Number(value) >= 0 &&
                            Number(value) <= 99
                          ) {
                            if (Number(value) !== item.quantity)
                              act(() =>
                                client.store.setQuantity(
                                  product.id,
                                  Number(value),
                                ),
                              );
                          } else {
                            event.target.value = String(item.quantity);

                            client.report(
                              new Error(
                                "Quantity must be a whole number between 0 and 99.",
                              ),
                            );
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                      <button
                        disabled={disabled || item.quantity === 99}
                        aria-label={`Increase ${product.name} quantity`}
                        onClick={() =>
                          act(() =>
                            client.store.setQuantity(
                              product.id,
                              item.quantity + 1,
                            ),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        act(() => client.store.setQuantity(product.id, 0))
                      }
                    >
                      {text.remove}
                    </button>
                  </div>
                </div>
                <strong className="line-price">
                  {formatMoney(product.priceMinor * item.quantity)}
                </strong>
              </article>
            );
          })
        )}
        {pending && (
          <p className="pending" role="status">
            {text.pending}
          </p>
        )}
      </div>
      <div className="cart-total">
        <span>
          {text.total}
          <small>
            {count} {count === 1 ? "item" : "items"} in your cart
          </small>
        </span>
        <strong>{formatMoney(cartTotal(state.cart, state.products))}</strong>
      </div>
    </section>
  );
}
