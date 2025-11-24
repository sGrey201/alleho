import { Robokassa } from '@dev-aces/robokassa';

const robokassaLogin = process.env.ROBOKASSA_LOGIN;
const robokassaPassword1 = process.env.ROBOKASSA_PASSWORD1;
const robokassaPassword2 = process.env.ROBOKASSA_PASSWORD2;
// Use ROBOKASSA_TEST_MODE env var to explicitly control test mode
// If not set, default to test mode in development and production mode in production
const isTestMode = process.env.ROBOKASSA_TEST_MODE 
  ? process.env.ROBOKASSA_TEST_MODE === 'true'
  : process.env.NODE_ENV !== 'production';

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
  invoiceId: string;
  userId: string;
  userEmail: string;
  subscriptionType: 'initial' | 'renewal';
}): string | null {
  if (!robokassa) {
    throw new Error('Robokassa not configured');
  }

  const baseUrl = process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : 'http://localhost:5000';

  const paymentUrl = robokassa.generatePaymentUrl({
    outSum: params.amount,
    description: params.description,
    invId: params.invoiceId,
    email: params.userEmail,
    userParameters: {
      shp_user_id: params.userId,
      shp_subscription_type: params.subscriptionType,
    },
    culture: 'ru',
  });

  console.log('🔗 Generated Robokassa payment URL:', paymentUrl);
  console.log('📋 Payment params:', {
    invoiceId: params.invoiceId,
    amount: params.amount,
    description: params.description,
  });

  return paymentUrl;
}

export function checkPayment(params: any): boolean {
  if (!robokassa) {
    throw new Error('Robokassa not configured');
  }

  return robokassa.checkPayment(params);
}
