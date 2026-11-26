/**
 * Siden er bygget med lagerstatus fra build-tidspunktet. Her hentes den aktuelle status,
 * så størrelser, der er blevet udsolgt siden, ikke kan vælges. Fejler kaldet, gælder
 * det, siden blev bygget med; kassen tjekker under alle omstændigheder lageret igen.
 */
export async function refreshStock(): Promise<void> {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-variant-id], [data-quick-add]");
  if (buttons.length === 0) return;

  let variants: Record<string, boolean>;
  try {
    const response = await fetch("/api/stock");
    if (!response.ok) return;
    variants = (await response.json()).variants ?? {};
  } catch {
    return;
  }

  buttons.forEach((button) => {
    const id = button.dataset.variantId ?? button.dataset.quickAdd ?? "";
    if (!(id in variants)) return;
    const available = variants[id];
    if (available === !button.disabled) return;

    button.disabled = !available;
    if (available) {
      delete button.dataset.soldout;
    } else {
      button.dataset.soldout = "true";
      if (button.getAttribute("role") === "radio") button.setAttribute("aria-checked", "false");
    }
  });
}
