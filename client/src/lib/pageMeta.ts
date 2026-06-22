import { META_DESCRIPTION } from "@shared/brand";

export type PageMeta = {
  title?: string;
  description?: string;
  url?: string;
  noindex?: boolean;
};

export const pageMeta = {
  auth: {
    title: "Вход",
    description: "Вход в платформу hovial для гомеопатов и пациентов.",
    url: "/auth",
  },
  inviteAccept: {
    title: "Приглашение",
    description: "Принятие приглашения на платформу hovial.",
    url: "/invite/accept",
  },
  roleOnboarding: {
    title: "Выбор роли",
    description: "Укажите, гомеопат вы или пациент, чтобы продолжить работу в hovial.",
    url: "/onboarding/role",
    noindex: true,
  },
  resetPassword: {
    title: "Новый пароль",
    description: "Восстановление пароля в hovial.",
    url: "/reset-password",
  },
  messenger: {
    title: "Мессенджер",
    description: "Чаты с пациентами и коллегами-гомеопатами в hovial.",
    url: "/messenger",
  },
  profile: {
    title: "Профиль",
    description: "Настройки профиля и параметры работы в hovial.",
    url: "/messenger/profile",
  },
  questionnaires: {
    title: "Анкеты",
    description: "Шаблоны анкет и работа с данными пациентов в hovial.",
    url: "/questionnaires",
  },
  questionnaireEdit: {
    title: "Редактирование анкеты",
    description: "Редактор шаблона анкеты в hovial.",
  },
  about: {
    title: "О платформе",
    description:
      "hovial — защищённая среда для практики гомеопата: пациенты, коллеги, анкеты и обмен опытом.",
    url: "/about",
  },
  subscribe: {
    title: "Подписка",
    description: "Оформление и продление доступа к материалам и функциям hovial.",
    url: "/subscribe",
  },
  terms: {
    title: "Условия и возврат",
    description: "Условия оказания услуг и возврата средств на платформе hovial.",
    url: "/terms",
  },
  oferta: {
    title: "Оферта",
    description: "Публичная оферта на оказание услуг hovial.",
    url: "/oferta",
  },
  notFound: {
    title: "Страница не найдена",
    description: META_DESCRIPTION,
  },
  paymentSuccess: {
    title: "Оплата прошла успешно",
    description: "Подтверждение оплаты подписки hovial.",
    url: "/payment/success",
    noindex: true,
  },
  paymentFail: {
    title: "Ошибка оплаты",
    description: "Не удалось завершить оплату подписки hovial.",
    url: "/payment/fail",
    noindex: true,
  },
} as const satisfies Record<string, PageMeta>;
