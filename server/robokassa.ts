import { Robokassa } from '@dev-aces/robokassa';

const robokassaLogin = process.env.ROBOKASSA_LOGIN;
const robokassaPassword1 = process.env.ROBOKASSA_PASSWORD1;
const robokassaPassword2 = process.env.ROBOKASSA_PASSWORD2;
const isTestMode = process.env.NODE_ENV !== 'production';

if (!robokassaLogin || !robokassaPassword1 || !robokassaPassword2) {
  console.warn('Robokassa credentials not configured. Payment functionality will be unavailable.');
}

export const robokassa = robokassaLogin && robokassaPassword1 && robokassaPassword2
  ? new Robokassa({
      merchantLogin: robokassaLogin,
      password1: robokassaPassword1,
      password2: robokassaPassword2,
      hashAlgorithm: 'md5',
      isTest: isTestMode,
    })
  : null;

export function generatePaymentUrl(params: {
  amount: number;
  description: string;
  invoiceId: number;
  userId: string;
  subscriptionType: 'initial' | 'renewal';
}): string | null {
  if (!robokassa) {
    throw new Error('Robokassa not configured');
  }

  const baseUrl = process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : 'http://localhost:5000';

  const isTestMode = process.env.NODE_ENV !== 'production';

  const paymentParams: any = {
    outSum: params.amount,
    description: params.description,
    invId: params.invoiceId,
    userParameters: {
      shp_user_id: params.userId,
      shp_subscription_type: params.subscriptionType,
    },
    culture: 'ru',
  };

  // Add receipt only in production mode (required by law in Russia)
  if (!isTestMode) {
    paymentParams.receipt = {
      items: [
        {
          sum: params.amount,
          name: params.description,
          quantity: 1,
          payment_method: 'full_payment',
          payment_object: 'service',
          tax: 'none',
        },
      ],
    };
  }

  return robokassa.generatePaymentUrl(paymentParams);
}

export function checkPayment(params: any): boolean {
  if (!robokassa) {
    throw new Error('Robokassa not configured');
  }

  return robokassa.checkPayment(params);
}
