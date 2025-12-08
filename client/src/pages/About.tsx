import bannerVideo from '@assets/баннер_1764664948472.mp4';

export default function About() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
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
        
        <h1 className="text-3xl font-bold text-foreground mb-8">О проекте</h1>
        
        <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground">
          <p className="text-justify">
            Добро пожаловать в уникальное пространство, где Materia Medica оживает в человеческих судьбах. Наш проект — это галерея живых портретов, инструмент развития интуитивного восприятия типажа с целью увидеть живой, узнаваемый образ за сухими рубриками реперториума. Каждая зарисовка — ключ к пониманию великой книги под названием Materia Medica.
          </p>
          <p className="text-justify">
            Мы будем регулярно публиковать новые портреты, исследуя как известные, так и редкие типажи в разных ситуациях.
          </p>
        </div>
      </div>
    </div>
  );
}
