export function formatOrderDesignation(items) {
  return items
    .flatMap((item) => {
      const label = `${item.productName ?? item.product_name} - ${item.color} - ${item.size}`;
      return Array.from({ length: item.qty }, () => label);
    })
    .join(" + ");
}
