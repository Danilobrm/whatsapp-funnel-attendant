import type { CartAddress } from "../../order/types/cart.types.js";

export interface Customer {
  id: number;
  phone: string;
  name: string | null;
  lastAddress: CartAddress | null;
}
