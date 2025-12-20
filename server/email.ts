import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendPasswordResetEmail(to: string, resetToken: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  // В production используем APP_URL или REPLIT_DOMAINS (без DEV домена)
  // В development используем REPLIT_DEV_DOMAIN
  const baseUrl = process.env.APP_URL 
    ? process.env.APP_URL
    : process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DOMAINS 
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000';
  
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  
  await client.emails.send({
    from: fromEmail,
    to: [to],
    subject: 'Восстановление пароля - Materia Medica Pro',
    html: `
      <div style="font-family: 'Source Sans Pro', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2C5282; margin-bottom: 20px;">Восстановление пароля</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Вы запросили восстановление пароля для вашего аккаунта на Materia Medica Pro.
        </p>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Нажмите на кнопку ниже, чтобы установить новый пароль:
        </p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #2C5282; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 20px 0;">
          Установить новый пароль
        </a>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.
        </p>
        <p style="font-size: 14px; color: #666;">
          Ссылка действительна в течение 1 часа.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999;">
          Materia Medica Pro — Живые портреты гомеопатических типажей
        </p>
      </div>
    `
  });
}

export async function sendReceiptEmail(to: string, receiptUrl: string, paymentAmount: string, paymentDate: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  await client.emails.send({
    from: fromEmail,
    to: [to],
    subject: 'Чек об оплате - Materia Medica Pro',
    html: `
      <div style="font-family: 'Source Sans Pro', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2C5282; margin-bottom: 20px;">Чек об оплате</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Здравствуйте!
        </p>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Ваш платёж на сумму <strong>${paymentAmount} ₽</strong> от ${paymentDate} успешно обработан.
        </p>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Чек об оплате доступен по ссылке:
        </p>
        <a href="${receiptUrl}" style="display: inline-block; background-color: #38A169; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 20px 0;">
          Открыть чек
        </a>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          Спасибо за вашу подписку!
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999;">
          Materia Medica Pro — Живые портреты гомеопатических типажей
        </p>
      </div>
    `
  });
}
