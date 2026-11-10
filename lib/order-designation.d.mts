type OrderDesignationItem = {
  productName?: string;
  product_name?: string;
  color: string;
  size: string;
  qty: number;
};

export function formatOrderDesignation(
  items: readonly OrderDesignationItem[]
): string;
