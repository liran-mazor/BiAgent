import { CustomerRegisteredEvent } from '@biagent/common';
import { saveCustomer } from '../db/customersRepository';

type RegisterCustomerInput = CustomerRegisteredEvent['data'];

export async function registerCustomer(input: RegisterCustomerInput): Promise<void> {
  await saveCustomer(input);
}
