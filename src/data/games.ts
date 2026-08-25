import compatibilityCover from '../../assets/covers/web/compatibility.webp?url';
import ideasCover from '../../assets/covers/web/ideas.webp?url';
import dateCover from '../../assets/covers/web/date.webp?url';
import smokingCover from '../../assets/covers/web/smoking.webp?url';
import chainCover from '../../assets/covers/web/chain.webp?url';
import voiceCover from '../../assets/covers/web/wandervoice.webp?url';
import bordersCover from '../../assets/covers/web/domino-borders.webp?url';
import quizCover from '../../assets/covers/web/quiz.webp?url';
import chaosCover from '../../assets/covers/web/domino-chaos.webp?url';
import truthCover from '../../assets/covers/web/truth.webp?url';
import type { JourneyRoute } from '../world/TransitionSystem';

export interface GameData {
  appId: number;
  title: string;
  description: string;
  cover: string;
  tag: string;
  accent: string;
  journeyRoute: JourneyRoute;
}

export const games: GameData[] = [
  {
    appId: 54709398,
    title: 'Тест на совместимость',
    description: 'Научный тест на совместимость на основе модели «Большой пятёрки». Пройди 20 вопросов и узнай, насколько вы подходите друг другу.',
    cover: compatibilityCover,
    tag: 'Тесты',
    accent: '#ff8ccf',
    journeyRoute: 'orbit',
  },
  {
    appId: 54707764,
    title: 'Генератор идей',
    description: 'Скрещивай жанры и механики, создавай уникальные игровые идеи. Лайкай, сохраняй и делись.',
    cover: ideasCover,
    tag: 'Креатив',
    accent: '#ffad54',
    journeyRoute: 'spiral',
  },
  {
    appId: 54707717,
    title: 'Давай рискнем',
    description: 'Пригласи на свидание без страха отказа. Выбирай блюда, дату и время — и отправляй приглашение.',
    cover: dateCover,
    tag: 'Свидания',
    accent: '#ff6f8d',
    journeyRoute: 'close-pass',
  },
  {
    appId: 54706814,
    title: 'Курить-НЕТ',
    description: 'Бросай курить вместе со мной. Отмечай прогресс, удерживай мотивацию и стань свободным.',
    cover: smokingCover,
    tag: 'Здоровье',
    accent: '#70f0ba',
    journeyRoute: 'dive',
  },
  {
    appId: 54710593,
    title: 'Цепная реакция',
    description: 'Отметься, стань частью истории и передай ссылку другу — наблюдай, как растёт ваша цепочка.',
    cover: chainCover,
    tag: 'Социальная',
    accent: '#60d6ff',
    journeyRoute: 'fly-through',
  },
  {
    appId: 54714168,
    title: 'WanderVoice',
    description: 'Преврати любой текст в голосовое сообщение. Выбери голос и получи ссылку без сервера и платежей.',
    cover: voiceCover,
    tag: 'Инструменты',
    accent: '#8c85ff',
    journeyRoute: 'tunnel',
  },
  {
    appId: 54557291,
    title: 'Домино: Границы',
    description: 'Логическая головоломка: собери 28 пар домино, расставляя границы между ними.',
    cover: bordersCover,
    tag: 'Головоломки',
    accent: '#f2ce72',
    journeyRoute: 'rift',
  },
  {
    appId: 54712457,
    title: 'Насколько ты меня знаешь',
    description: 'Создай викторину о себе, отправь друзьям и узнай, кто действительно знает тебя лучше всех.',
    cover: quizCover,
    tag: 'Тесты',
    accent: '#ff9b62',
    journeyRoute: 'slingshot',
  },
  {
    appId: 54548362,
    title: 'Домино: Хаос',
    description: 'Собери 27 пар из осколков. Только один из десяти пройдёт испытание — бросишь вызов?',
    cover: chaosCover,
    tag: 'Головоломки',
    accent: '#fa6a55',
    journeyRoute: 'recoil',
  },
  {
    appId: 54722527,
    title: 'Правда или Ложь',
    description: 'Создай викторину, где одно утверждение — ложь. Отправь другу и проверь его внимательность.',
    cover: truthCover,
    tag: 'Викторины',
    accent: '#62e1cd',
    journeyRoute: 'ascent',
  },
];
