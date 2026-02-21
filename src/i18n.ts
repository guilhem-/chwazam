interface Strings {
  placeFingers: string;
  needPlayers: string;
  winner: string;
  tapAgain: string;
  cannons: string;
  missilesIncoming: string;
  missilesActive: string;
}

const translations: Record<string, Strings> = {
  en: {
    placeFingers: 'Place your fingers',
    needPlayers: 'Need at least 2 players',
    winner: 'WINNER!',
    tapAgain: 'Tap to play again',
    cannons: 'Cannons',
    missilesIncoming: 'GUIDED MISSILES INCOMING',
    missilesActive: 'GUIDED MISSILES ACTIVE',
  },
  fr: {
    placeFingers: 'Posez vos doigts',
    needPlayers: 'Il faut au moins 2 joueurs',
    winner: 'GAGNANT !',
    tapAgain: 'Touchez pour rejouer',
    cannons: 'Canons',
    missilesIncoming: 'MISSILES GUIDÉS EN APPROCHE',
    missilesActive: 'MISSILES GUIDÉS ACTIFS',
  },
  de: {
    placeFingers: 'Legt eure Finger auf',
    needPlayers: 'Mindestens 2 Spieler nötig',
    winner: 'GEWINNER!',
    tapAgain: 'Tippen um neu zu starten',
    cannons: 'Kanonen',
    missilesIncoming: 'LENKRAKETEN IM ANFLUG',
    missilesActive: 'LENKRAKETEN AKTIV',
  },
  es: {
    placeFingers: 'Coloca tus dedos',
    needPlayers: 'Se necesitan al menos 2 jugadores',
    winner: '¡GANADOR!',
    tapAgain: 'Toca para jugar de nuevo',
    cannons: 'Cañones',
    missilesIncoming: 'MISILES GUIADOS EN CAMINO',
    missilesActive: 'MISILES GUIADOS ACTIVOS',
  },
  ja: {
    placeFingers: '指を置いてください',
    needPlayers: '2人以上必要です',
    winner: '勝者！',
    tapAgain: 'タップしてもう一度',
    cannons: '大砲',
    missilesIncoming: '誘導ミサイル接近中',
    missilesActive: '誘導ミサイル発射中',
  },
  zh: {
    placeFingers: '请放上手指',
    needPlayers: '至少需要2名玩家',
    winner: '胜利者！',
    tapAgain: '点击重新开始',
    cannons: '大炮',
    missilesIncoming: '制导导弹即将来袭',
    missilesActive: '制导导弹已激活',
  },
  ko: {
    placeFingers: '손가락을 올려주세요',
    needPlayers: '최소 2명이 필요합니다',
    winner: '승자!',
    tapAgain: '탭하여 다시 시작',
    cannons: '대포',
    missilesIncoming: '유도 미사일 접근 중',
    missilesActive: '유도 미사일 활성화',
  },
  pt: {
    placeFingers: 'Coloque seus dedos',
    needPlayers: 'Precisa de pelo menos 2 jogadores',
    winner: 'VENCEDOR!',
    tapAgain: 'Toque para jogar novamente',
    cannons: 'Canhões',
    missilesIncoming: 'MÍSSEIS GUIADOS A CAMINHO',
    missilesActive: 'MÍSSEIS GUIADOS ATIVOS',
  },
  it: {
    placeFingers: 'Posiziona le dita',
    needPlayers: 'Servono almeno 2 giocatori',
    winner: 'VINCITORE!',
    tapAgain: 'Tocca per rigiocare',
    cannons: 'Cannoni',
    missilesIncoming: 'MISSILI GUIDATI IN ARRIVO',
    missilesActive: 'MISSILI GUIDATI ATTIVI',
  },
  ru: {
    placeFingers: 'Поставьте пальцы',
    needPlayers: 'Нужно минимум 2 игрока',
    winner: 'ПОБЕДИТЕЛЬ!',
    tapAgain: 'Нажмите чтобы начать снова',
    cannons: 'Пушки',
    missilesIncoming: 'САМОНАВОДЯЩИЕСЯ РАКЕТЫ',
    missilesActive: 'РАКЕТЫ АКТИВНЫ',
  },
  ar: {
    placeFingers: 'ضع أصابعك',
    needPlayers: 'يلزم لاعبان على الأقل',
    winner: '!الفائز',
    tapAgain: 'انقر للعب مرة أخرى',
    cannons: 'مدافع',
    missilesIncoming: 'صواريخ موجهة قادمة',
    missilesActive: 'صواريخ موجهة نشطة',
  },
};

function detectLanguage(): string {
  const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
  return lang;
}

let currentStrings: Strings = translations.en;

export function initI18n() {
  const lang = detectLanguage();
  currentStrings = translations[lang] || translations.en;
}

export function t(): Strings {
  return currentStrings;
}
