# Wanderhaym Games — cinematic WebGL experience

Интерактивная 3D-витрина мини-игр Wanderhaym. Пользователь путешествует камерой
между десятью отдельными игровыми залами, взаимодействует с огненным ядром и
запускает выбранную игру во ВКонтакте.

## Что находится в сцене

- реальная `Three.js Scene` и `PerspectiveCamera`;
- Camera Journey по пространственному кольцу из десяти миров;
- half-float ping-pong FBO для жидкой деформации от мыши;
- procedural GPU fire core с ударной волной и реакцией на молот маскота;
- GPU-анимированные искры и огненная мантия;
- bloom, chromatic displacement, grain и cinematic transition shader;
- яркие unlit/sRGB-обложки в объёмных металлических порталах;
- утверждённая покадровая анимация рисованного кота с прозрачным фоном;
- адаптивные high/medium/low профили для desktop и mobile.

## Стек

- TypeScript
- Three.js
- Vite
- WebGL render targets / GLSL shaders
- GitHub Pages

## Локальная разработка

```bash
npm install
npm run dev
```

Проверка и production-сборка:

```bash
npm run typecheck
npm run build
npm run preview
```

Готовая сборка создаётся в `dist/`. Публикация выполняется GitHub Actions после
push в `main`; до финальной проверки изменения можно полностью тестировать
локально без обновления публичного сайта.

## Управление

- колесо мыши, стрелки клавиатуры или кнопки — переход между мирами;
- свайп — навигация на сенсорном экране;
- движение указателя — жидкая FBO-деформация и camera parallax;
- пробел или короткий клик по свободной области — удар молота;
- клик по активной обложке — запуск VK Mini App.

© Wanderhaym Games
