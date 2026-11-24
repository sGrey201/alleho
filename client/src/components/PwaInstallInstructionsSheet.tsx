import type { ReactNode } from "react";
import { Check, ChevronDown, Compass, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PwaInstallBrowser = "safari" | "chrome" | "yandex";

type PwaInstallInstructionsSheetProps = {
  browser: PwaInstallBrowser | null;
  onOpenChange: (open: boolean) => void;
};

type Shot = {
  src: string;
  alt: string;
  wide?: boolean;
  maxClass?: string;
};

type StepChip = "link" | "share" | "more" | "add-home" | "dots-v" | "dots-h" | "shortcut" | "webapp";

type InstallStep = {
  title: string;
  body: string;
  chip?: StepChip;
  shot?: Shot;
};

const ICON = "/pwa-install/icon.png";
const WEBAPP_SHOT: Shot = {
  src: "/pwa-install/webapp-add.jpg",
  alt: "Окно «На экран «Домой»»: включён переключатель «Открыть как веб-приложение», стрелка на кнопку «Добавить»",
};
const HOME_SHOT: Shot = {
  src: "/pwa-install/home-screen.jpg",
  alt: "Экран «Домой» iPhone, обведена новая иконка Hovial",
};

const WEBAPP_STEP: InstallStep = {
  title: "Включите веб-приложение и нажмите «Добавить»",
  body: "Переключатель «Открыть как веб-приложение» должен быть зелёным. Название можно оставить как есть.",
  chip: "webapp",
  shot: WEBAPP_SHOT,
};

const GUIDES: Record<
  PwaInstallBrowser,
  { label: string; steps: InstallStep[]; help: string[] }
> = {
  chrome: {
    label: "Google Chrome",
    steps: [
      {
        title: "Откройте сайт в Google Chrome",
        body: "Запустите браузер Chrome и введите в адресной строке:",
        chip: "link",
      },
      {
        title: "Нажмите значок «Поделиться»",
        body: "Квадрат со стрелкой вверх — справа в адресной строке вверху экрана.",
        chip: "share",
        shot: {
          src: "/pwa-install/chrome-share.jpg",
          alt: "Адресная строка Chrome: hovial.com, стрелка на значок «Поделиться» справа",
          wide: true,
        },
      },
      {
        title: "Нажмите «Показать больше»",
        body: "Круглая кнопка со стрелкой вниз — последняя в нижнем ряду.",
        chip: "more",
        shot: {
          src: "/pwa-install/chrome-more.jpg",
          alt: "Окно «Поделиться», обведена кнопка «Показать больше»",
        },
      },
      {
        title: "Выберите «Добавить на экран „Домой“»",
        body: "Если пункта не видно сразу, пролистайте список вниз.",
        chip: "add-home",
        shot: {
          src: "/pwa-install/chrome-add-home.jpg",
          alt: "Список действий, стрелка на пункт «Добавить на экран «Домой»»",
        },
      },
      WEBAPP_STEP,
    ],
    help: [
      "Проверьте, что сайт открыт именно в Chrome.",
      "Не видите «Добавить на экран „Домой“»? Пролистайте список в шаге 4 до конца.",
      "Иконку Hovial можно перемещать и удалять, как любое приложение.",
    ],
  },
  yandex: {
    label: "Яндекс Браузер",
    steps: [
      {
        title: "Откройте сайт в Яндекс Браузере",
        body: "Запустите Яндекс Браузер и введите в адресной строке:",
        chip: "link",
      },
      {
        title: "Нажмите «⋮» справа от адреса",
        body: "Кнопка с тремя вертикальными точками — в строке адреса внизу экрана.",
        chip: "dots-v",
        shot: {
          src: "/pwa-install/yandex-menu.jpg",
          alt: "Нижняя панель Яндекс Браузера: адрес hovial.com и кнопка с тремя точками справа",
          wide: true,
        },
      },
      {
        title: "Выберите «Добавить ярлык на телефон»",
        body: "Пункт находится в середине меню — при необходимости пролистайте.",
        chip: "shortcut",
        shot: {
          src: "/pwa-install/yandex-shortcut.jpg",
          alt: "Меню Яндекс Браузера, обведён пункт «Добавить ярлык на телефон»",
        },
      },
      {
        title: "Нажмите «Добавить на экран „Домой“»",
        body: "Круглая кнопка с плюсом в окне, которое появится внизу.",
        chip: "add-home",
        shot: {
          src: "/pwa-install/yandex-add-home.jpg",
          alt: "Окно внизу экрана, стрелка на кнопку «Добавить на экран «Домой»»",
          wide: true,
        },
      },
      WEBAPP_STEP,
    ],
    help: [
      "Проверьте, что сайт открыт именно в Яндекс Браузере.",
      "Не видите «Добавить ярлык на телефон»? Пролистайте меню из шага 3 вниз.",
      "Иконку Hovial можно перемещать и удалять, как любое приложение.",
    ],
  },
  safari: {
    label: "Safari",
    steps: [
      {
        title: "Откройте сайт в Safari",
        body: "Запустите браузер Safari и введите в адресной строке:",
        chip: "link",
      },
      {
        title: "Нажмите «⋯» справа внизу",
        body: "Кнопка с тремя точками — в нижней панели, справа от адреса сайта.",
        chip: "dots-h",
        shot: {
          src: "/pwa-install/safari-dots.jpg",
          alt: "Нижняя панель Safari: адрес hovial.com и кнопка с тремя точками справа",
          wide: true,
        },
      },
      {
        title: "Выберите «Поделиться»",
        body: "Это первый пункт в открывшемся меню.",
        chip: "share",
        shot: {
          src: "/pwa-install/safari-share.jpg",
          alt: "Меню Safari, обведён пункт «Поделиться»",
          maxClass: "max-w-[330px]",
        },
      },
      {
        title: "Нажмите «Показать больше»",
        body: "Круглая кнопка со стрелкой вниз — последняя в нижнем ряду.",
        chip: "more",
        shot: {
          src: "/pwa-install/safari-more.jpg",
          alt: "Окно «Поделиться», стрелка указывает на кнопку «Показать больше»",
        },
      },
      {
        title: "Выберите «Добавить на экран „Домой“»",
        body: "Если пункта не видно сразу, пролистайте список вниз.",
        chip: "add-home",
        shot: {
          src: "/pwa-install/safari-add-home.jpg",
          alt: "Список действий, обведён пункт «Добавить на экран «Домой»»",
        },
      },
      WEBAPP_STEP,
    ],
    help: [
      "Проверьте, что сайт открыт именно в Safari.",
      "Не видите «Добавить на экран „Домой“»? Пролистайте список в шаге 5 до конца.",
      "Иконку Hovial можно перемещать и удалять, как любое приложение.",
    ],
  },
};

const chipClass =
  "flex items-center gap-2.5 rounded-[14px] bg-[#F1F3F6] px-3.5 py-[11px] text-base font-semibold leading-tight text-[#16181C]";

function StrokeIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function ShareGlyph() {
  return (
    <StrokeIcon>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </StrokeIcon>
  );
}

function Dots({ vertical }: { vertical?: boolean }) {
  const points = vertical
    ? [
        [12, 5],
        [12, 12],
        [12, 19],
      ]
    : [
        [5, 12],
        [12, 12],
        [19, 12],
      ];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {points.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="currentColor" />
      ))}
    </svg>
  );
}

function StepChipView({ chip }: { chip: StepChip }) {
  if (chip === "link") {
    return (
      <a
        href="https://hovial.com"
        className="flex min-h-12 items-center gap-2.5 rounded-[14px] bg-[#F1F3F6] px-4 text-lg font-semibold text-[#0A56B8] no-underline active:opacity-70"
      >
        <Globe className="h-5 w-5 shrink-0" aria-hidden />
        <span>hovial.com</span>
      </a>
    );
  }
  if (chip === "webapp") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[#F1F3F6] px-3.5 py-2.5 text-base font-semibold leading-tight text-[#16181C]">
          <span>Открыть как веб-приложение</span>
          <span
            aria-hidden
            className="flex h-7 w-[46px] shrink-0 items-center justify-end rounded-full bg-[#34C759] p-0.5"
          >
            <span className="h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#F1F3F6] py-2 pl-2 pr-3.5 text-base font-semibold text-[#16181C]">
          <span className="rounded-[18px] bg-[#0866E0] px-4 py-[7px] text-base font-bold text-white">Добавить</span>
          <span className="font-medium text-[#4F5661]">вверху справа</span>
        </div>
      </div>
    );
  }

  if (chip === "shortcut") {
    return (
      <div className={chipClass}>
        <StrokeIcon>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M12 9v6" />
          <path d="M9 12h6" />
        </StrokeIcon>
        <span>Добавить ярлык на телефон</span>
      </div>
    );
  }

  const content: Record<Exclude<StepChip, "link" | "webapp" | "shortcut">, ReactNode> = {
    share: (
      <>
        <ShareGlyph />
        <span>Поделиться</span>
      </>
    ),
    more: (
      <>
        <ChevronDown className="h-[22px] w-[22px] shrink-0" aria-hidden />
        <span>Показать больше</span>
      </>
    ),
    "add-home": (
      <>
        <StrokeIcon>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </StrokeIcon>
        <span>Добавить на экран «Домой»</span>
      </>
    ),
    "dots-v": (
      <>
        <Dots vertical />
        <span>Три точки</span>
      </>
    ),
    "dots-h": (
      <>
        <Dots />
        <span>Три точки</span>
      </>
    ),
  };

  return <div className={chipClass}>{content[chip]}</div>;
}

function StepBadge({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#4E5A22] text-[17px] font-bold text-white">
      {children}
    </div>
  );
}

export function PwaInstallInstructionsSheet({
  browser,
  onOpenChange,
}: PwaInstallInstructionsSheetProps) {
  const supportsNativeInstall = browser === "chrome" || browser === "yandex";
  const { canNativeInstall, triggerNativeInstall } = usePwaInstall(supportsNativeInstall);
  const guide = browser ? GUIDES[browser] : null;

  const close = () => onOpenChange(false);

  return (
    <Sheet open={browser !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#EEF2F6] p-0 text-[#16181C]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {guide ? (
            <main className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 pb-12">
              <header className="flex flex-col items-center gap-3 px-8 pb-1 pt-8 text-center">
                <img
                  src={ICON}
                  alt="Иконка Hovial"
                  width={72}
                  height={72}
                  className="h-[72px] w-[72px] rounded-[18px] shadow-[0_2px_8px_rgba(22,24,28,0.12),0_0_0_1px_rgba(22,24,28,0.06)]"
                />
                <SheetTitle className="m-0 text-[28px] font-extrabold leading-[1.2] tracking-tight text-[#16181C]">
                  Как установить Hovial на iPhone
                </SheetTitle>
                <div className="flex items-center gap-2 rounded-[18px] bg-white px-3.5 py-1.5 text-base font-bold text-[#4E5A22] shadow-[0_0_0_1px_rgba(22,24,28,0.08)]">
                  <Compass className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span>{guide.label}</span>
                </div>
                <p className="m-0 max-w-[340px] text-[17px] leading-[1.45] text-[#4F5661]">
                  Добавьте иконку на экран «Домой» — Hovial будет открываться как обычное приложение.
                </p>
              </header>

              {guide.steps.map((step, index) => (
                <section
                  key={step.title}
                  className="flex flex-col gap-3.5 rounded-[22px] bg-white px-4 pb-4 pt-[18px] shadow-[0_1px_2px_rgba(22,24,28,0.06),0_0_0_1px_rgba(22,24,28,0.04)]"
                >
                  <div className="flex items-start gap-3">
                    <StepBadge>{index + 1}</StepBadge>
                    <div className="flex min-w-0 flex-col gap-1 pt-1">
                      <h2 className="m-0 text-[19px] font-bold leading-[1.3]">{step.title}</h2>
                      <p className="m-0 text-base leading-[1.45] text-[#4F5661]">{step.body}</p>
                    </div>
                  </div>
                  {step.chip ? <StepChipView chip={step.chip} /> : null}
                  {step.shot ? (
                    <img
                      src={step.shot.src}
                      alt={step.shot.alt}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "mx-auto block h-auto w-full rounded-[14px] border border-[#E2E6EB] bg-white",
                        !step.shot.wide && (step.shot.maxClass ?? "max-w-[340px]"),
                      )}
                    />
                  ) : null}
                </section>
              ))}

              <section className="flex flex-col gap-3.5 rounded-[22px] bg-white px-4 pb-4 pt-[18px] shadow-[0_1px_2px_rgba(22,24,28,0.06),0_0_0_1px_rgba(22,24,28,0.04)]">
                <div className="flex items-start gap-3">
                  <StepBadge>
                    <Check className="h-5 w-5" strokeWidth={2.6} aria-hidden />
                  </StepBadge>
                  <div className="flex min-w-0 flex-col gap-1 pt-1">
                    <h2 className="m-0 text-[19px] font-bold leading-[1.3]">Готово!</h2>
                    <p className="m-0 text-base leading-[1.45] text-[#4F5661]">
                      На экране «Домой» появилась иконка Hovial. Открывайте приложение одним касанием.
                    </p>
                  </div>
                </div>
                <img
                  src={HOME_SHOT.src}
                  alt={HOME_SHOT.alt}
                  loading="lazy"
                  decoding="async"
                  className="mx-auto block h-auto w-full max-w-[340px] rounded-[14px] border border-[#E2E6EB] bg-white"
                />
              </section>

              <section className="flex flex-col gap-2.5 rounded-[22px] border border-dashed border-[#B9C2CD] px-4 py-[18px]">
                <h2 className="m-0 text-lg font-bold leading-[1.3]">Не получается?</h2>
                <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-base leading-[1.45] text-[#4F5661]">
                  {guide.help.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </main>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E2E6EB] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {supportsNativeInstall && canNativeInstall ? (
            <Button type="button" className="w-full" onClick={() => void triggerNativeInstall()}>
              {t.installAppNativeButton}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="w-full" onClick={close}>
            Закрыть
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
