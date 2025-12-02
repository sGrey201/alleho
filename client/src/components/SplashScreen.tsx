import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import bannerVideo from '@assets/баннер_1764664948472.mp4';

const SPLASH_SEEN_KEY = 'materiamedica_splash_seen';

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const hasSeenSplash = localStorage.getItem(SPLASH_SEEN_KEY);
    if (!hasSeenSplash) {
      setShowSplash(true);
    }
  }, []);

  const handleEnter = () => {
    localStorage.setItem(SPLASH_SEEN_KEY, 'true');
    setIsVisible(false);
    setTimeout(() => {
      setShowSplash(false);
    }, 500);
  };

  if (!showSplash) {
    return <>{children}</>;
  }

  return (
    <>
      {showSplash && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center bg-background overflow-y-auto transition-opacity duration-500 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-3xl px-6 py-12 text-center">
            <div className="mb-8 rounded-lg overflow-hidden shadow-lg">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full"
              >
                <source src={bannerVideo} type="video/mp4" />
              </video>
            </div>
            
            <div className="mb-10 space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground">
              <p>
                Добро пожаловать в уникальное пространство, где Materia Medica оживает в человеческих судьбах. Наш проект — это галерея живых портретов, инструмент развития интуитивного восприятия типажа с целью увидеть живой, узнаваемый образ за сухими рубриками реперториума. Каждая зарисовка — ключ к пониманию великой книги под названием Materia Medica.
              </p>
              <p className="text-justify">
                Мы будем регулярно публиковать новые портреты, исследуя как известные, так и редкие типажи в разных ситуациях.
              </p>
            </div>
            
            <Button
              size="lg"
              onClick={handleEnter}
              className="px-10 py-6 text-lg font-semibold"
              data-testid="button-enter-site"
            >
              На сайт
            </Button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
