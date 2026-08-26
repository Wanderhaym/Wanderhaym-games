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
import dominoSudokuCover from '../../assets/covers/web/domino-sudoku-secret.webp?url';
import type { JourneyRoute } from '../world/TransitionSystem';
import type { PortalRevealMode } from '../world/InteractivePortalCover';
import type { EnvironmentKind } from '../world/environment/WorldTheme';

export interface WorldProfile {
  environment: EnvironmentKind;
  reveal: PortalRevealMode;
  audioRoot: number;
  particleMode: number;
  particleDensity: number;
  lightEnergy: number;
  secondary: string;
  background: string;
}

export interface GameData {
  appId: number;
  okAppId?: number;
  title: string;
  description: string;
  cover: string;
  tag: string;
  accent: string;
  journeyRoute: JourneyRoute;
  profile: WorldProfile;
  secret?: boolean;
}

export const games: GameData[] = [
  {
    appId: 54557291,
    okAppId: 512004416640,
    title: 'Домино: Границы',
    description: 'Логическая головоломка: собери 28 пар домино, расставляя границы между ними.',
    cover: bordersCover,
    tag: 'Головоломки',
    accent: '#f2ce72',
    journeyRoute: 'rift',
    profile: { environment: 'boundaries', reveal: 'grid', audioRoot: 131, particleMode: 4, particleDensity: 0.14, lightEnergy: 0.36, secondary: '#ffe29a', background: '#100c03' },
  },
  {
    appId: 54709398,
    okAppId: 512005270010,
    title: 'Тест на совместимость',
    description: 'Научный тест на совместимость на основе модели «Большой пятёрки». Пройди 20 вопросов и узнай, насколько вы подходите друг другу.',
    cover: compatibilityCover,
    tag: 'Тесты',
    accent: '#ff8ccf',
    journeyRoute: 'orbit',
    profile: { environment: 'compatibility', reveal: 'bond', audioRoot: 174, particleMode: 0, particleDensity: 0.26, lightEnergy: 0.65, secondary: '#76d9ff', background: '#09040d' },
  },
  {
    appId: 54707764,
    okAppId: 512005295786,
    title: 'Генератор идей',
    description: 'Скрещивай жанры и механики, создавай уникальные игровые идеи. Лайкай, сохраняй и делись.',
    cover: ideasCover,
    tag: 'Креатив',
    accent: '#ffad54',
    journeyRoute: 'spiral',
    profile: { environment: 'ideas', reveal: 'shards', audioRoot: 196, particleMode: 1, particleDensity: 0.28, lightEnergy: 0.62, secondary: '#ff5d72', background: '#100704' },
  },
  {
    appId: 54707717,
    okAppId: 512005214410,
    title: 'Давай рискнем',
    description: 'Пригласи на свидание без страха отказа. Выбирай блюда, дату и время — и отправляй приглашение.',
    cover: dateCover,
    tag: 'Свидания',
    accent: '#ff6f8d',
    journeyRoute: 'close-pass',
    profile: { environment: 'constellation', reveal: 'decision', audioRoot: 220, particleMode: 2, particleDensity: 0.18, lightEnergy: 0.46, secondary: '#ffd46b', background: '#0e0308' },
  },
  {
    appId: 54706814,
    okAppId: 512005090918,
    title: 'Курить-НЕТ',
    description: 'Бросай курить вместе со мной. Отмечай прогресс, удерживай мотивацию и стань свободным.',
    cover: smokingCover,
    tag: 'Здоровье',
    accent: '#70f0ba',
    journeyRoute: 'dive',
    profile: { environment: 'constellation', reveal: 'smoke', audioRoot: 147, particleMode: 3, particleDensity: 0.16, lightEnergy: 0.4, secondary: '#75ffe0', background: '#02100d' },
  },
  {
    appId: 54710593,
    okAppId: 512004791599,
    title: 'Цепная реакция',
    description: 'Отметься, стань частью истории и передай ссылку другу — наблюдай, как растёт ваша цепочка.',
    cover: chainCover,
    tag: 'Социальная',
    accent: '#60d6ff',
    journeyRoute: 'fly-through',
    profile: { environment: 'constellation', reveal: 'chain', audioRoot: 164, particleMode: 4, particleDensity: 0.2, lightEnergy: 0.5, secondary: '#8f7cff', background: '#020b12' },
  },
  {
    appId: 54714168,
    okAppId: 512005315207,
    title: 'WanderVoice',
    description: 'Преврати любой текст в голосовое сообщение. Выбери голос и получи ссылку без сервера и платежей.',
    cover: voiceCover,
    tag: 'Инструменты',
    accent: '#8c85ff',
    journeyRoute: 'tunnel',
    profile: { environment: 'constellation', reveal: 'waveform', audioRoot: 185, particleMode: 2, particleDensity: 0.18, lightEnergy: 0.44, secondary: '#ff6fd8', background: '#070515' },
  },
  {
    appId: 54712457,
    okAppId: 512005186234,
    title: 'Насколько ты меня знаешь',
    description: 'Создай викторину о себе, отправь друзьям и узнай, кто действительно знает тебя лучше всех.',
    cover: quizCover,
    tag: 'Тесты',
    accent: '#ff9b62',
    journeyRoute: 'slingshot',
    profile: { environment: 'constellation', reveal: 'radar', audioRoot: 208, particleMode: 3, particleDensity: 0.19, lightEnergy: 0.46, secondary: '#ff7b58', background: '#100604' },
  },
  {
    appId: 54548362,
    okAppId: 512004426991,
    title: 'Домино: Хаос',
    description: 'Собери 27 пар из осколков. Только один из десяти пройдёт испытание — бросишь вызов?',
    cover: chaosCover,
    tag: 'Головоломки',
    accent: '#fa6a55',
    journeyRoute: 'recoil',
    profile: { environment: 'constellation', reveal: 'organic', audioRoot: 139, particleMode: 5, particleDensity: 0.22, lightEnergy: 0.52, secondary: '#ffb03a', background: '#110302' },
  },
  {
    appId: 54722527,
    okAppId: 512005165098,
    title: 'Правда или Ложь',
    description: 'Создай викторину, где одно утверждение — ложь. Отправь другу и проверь его внимательность.',
    cover: truthCover,
    tag: 'Викторины',
    accent: '#62e1cd',
    journeyRoute: 'ascent',
    profile: { environment: 'constellation', reveal: 'truth', audioRoot: 233, particleMode: 2, particleDensity: 0.17, lightEnergy: 0.42, secondary: '#5ce7ff', background: '#020e0d' },
  },
];

export const secretGame: GameData = {
  appId: 54647574,
  okAppId: 512005287503,
  title: 'Домино Судоку',
  description: 'Секретная логическая кузница: размещай костяшки домино на поле 6 × 7, продумывай ходы и заполняй древнюю сетку.',
  cover: dominoSudokuCover,
  tag: 'Секретный мир',
  accent: '#f2a93b',
  journeyRoute: 'relic-forge',
  profile: { environment: 'relic', reveal: 'domino', audioRoot: 110, particleMode: 5, particleDensity: 0.15, lightEnergy: 0.54, secondary: '#ffd982', background: '#090502' },
  secret: true,
};

export const allGames: GameData[] = [...games, secretGame];
