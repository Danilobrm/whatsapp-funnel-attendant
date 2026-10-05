import { Module } from "@nestjs/common";

import { CustomerRepository } from "./repositories/customer.repository.js";
import { CustomerService } from "./services/customer.service.js";

@Module({
  providers: [CustomerRepository, CustomerService],
  exports: [CustomerRepository, CustomerService],
})
export class CustomerModule {}
