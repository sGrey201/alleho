import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  // Prefer env vars (local / non-Replit)
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      throw new Error('RESEND_FROM_EMAIL is required when RESEND_API_KEY is set');
    }
    return { apiKey, fromEmail };
  }

  // Replit Connectors
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('Email not configured: set RESEND_API_KEY and RESEND_FROM_EMAIL in .env, or use Replit Resend connector');
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

export async function sendInviteEmail(to: string, password: string, doctorName: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  const baseUrl = process.env.APP_URL 
    ? process.env.APP_URL
    : process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DOMAINS 
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000';
  
  const healthWallUrl = `${baseUrl}/health-wall`;
  
  await client.emails.send({
    from: fromEmail,
    to: [to],
    subject: 'Приглашение на Materia Medica Pro',
    html: `
      <div style="font-family: 'Source Sans Pro', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2C5282; margin-bottom: 20px;">Приглашение от вашего гомеопата</h1>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Здравствуйте!
        </p>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Гомеопат <strong>${doctorName}</strong> приглашает вас на платформу Materia Medica Pro для ведения вашей истории здоровья.
        </p>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Ваши данные для входа:
        </p>
        <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="font-size: 15px; color: #333; margin: 4px 0;"><strong>Логин:</strong> ${to}</p>
          <p style="font-size: 15px; color: #333; margin: 4px 0;"><strong>Пароль:</strong> ${password}</p>
        </div>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">
          Перейдите на вашу Стену здоровья по ссылке:
        </p>
        <a href="${healthWallUrl}" style="display: inline-block; background-color: #2C5282; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 20px 0;">
          Открыть Стену здоровья
        </a>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          Рекомендуем сменить пароль после первого входа.
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
