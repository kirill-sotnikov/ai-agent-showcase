import type { PersistedState } from "@shop/shared/contracts";
import { cartTotal } from "@shop/shared/domain";
import { formatMoney } from "@shop/shared/money";
import * as styles from "../../styles.css";
import { text } from "../../ui/text";
import { useWorkspaceClient } from "../../workspace";
import { Icon } from "../ui/icon";
import { ProductTile } from "../ui/product-tile";

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
  const client = useWorkspaceClient();
  const count = state.cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section
      className={`${styles.panel} ${styles.cartPanel}`}
      aria-label="Cart"
    >
      <div className={styles.compactHeading}>
        <div className={styles.headingLabel}>
          <Icon name="bag" />
          <h2>{text.cart}</h2>
          <span className={styles.count}>{count}</span>
        </div>
        <span
          data-testid="cart-total"
          className={`${styles.muted} ${styles.small}`}
        >
          {formatMoney(cartTotal(state.cart, state.products))}
        </span>
      </div>
      <div className={styles.cartScroll}>
        {state.cart.items.length === 0 ? (
          <div className={styles.emptyCart}>
            <div className={styles.emptyIllustration}>
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
              <article key={item.productId} className={styles.cartItem}>
                <ProductTile product={product} />
                <div className={styles.cartItemMain}>
                  <span className={styles.eyebrow}>
                    {product.category || "PRODUCT"}
                  </span>
                  <h3>{product.name}</h3>
                  <div className={styles.quantityRow}>
                    <div className={styles.stepper}>
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
                      className={styles.textButton}
                      disabled={disabled}
                      onClick={() =>
                        act(() => client.store.setQuantity(product.id, 0))
                      }
                    >
                      {text.remove}
                    </button>
                  </div>
                </div>
                <strong className={styles.linePrice}>
                  {formatMoney(product.priceMinor * item.quantity)}
                </strong>
              </article>
            );
          })
        )}
        {pending && (
          <p className={styles.pending} role="status">
            {text.pending}
          </p>
        )}
      </div>
    </section>
  );
}
