export const URLS = {
  INTL: {
    LOGIN_PAGE:
      'https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/',
    LOGIN_ENDPOINT: 'https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid',
    RECORD_RECENT_PAGE: 'https://maimaidx-eng.com/maimai-mobile/record',
    RECORD_MUSICS_PAGE: 'https://maimaidx-eng.com/maimai-mobile/record/musicGenre/search/',
    // The friend code page (design §6.2); to be confirmed on a real intl account (§16.4)
    FRIEND_CODE_PAGE: 'https://maimaidx-eng.com/maimai-mobile/friend/userFriendCode/',
  },
  JP: {
    LOGIN_PAGE: 'https://maimaidx.jp/maimai-mobile/',
    LOGIN_ENDPOINT: 'https://maimaidx.jp/maimai-mobile/submit/',
    LOGIN_AIMELIST: 'https://maimaidx.jp/maimai-mobile/aimeList/',
    LOGIN_AIMELIST_SUBMIT: 'https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0',
    HOMEPAGE: 'https://maimaidx.jp/maimai-mobile/home/',
    RECORD_RECENT_PAGE: 'https://maimaidx.jp/maimai-mobile/record',
    RECORD_MUSICS_PAGE: 'https://maimaidx.jp/maimai-mobile/record/musicGenre/search/',
    // The friend code page (design §6.2); to be confirmed on a real JP account (§16.4)
    FRIEND_CODE_PAGE: 'https://maimaidx.jp/maimai-mobile/friend/userFriendCode/',
  },

  CHECKLIST: {
    ERROR: ['https://maimaidx-eng.com/maimai-mobile/error/', 'https://maimaidx.jp/maimai-mobile/error/'],
    // maimai NET (JP scheduled, JP emergency, international) and the Aime login gateway
    MAINTENANCE: [
      '定期メンテナンス中です',
      '緊急メンテナンス中です',
      'Sorry, servers are under maintenance.',
      '現在メンテナンスを行っております',
    ],
    // where the Aime login gateway and maimai NET send every request during maintenance
    MAINTENANCE_REDIRECT: /\/maintenance(?:\.html|\/|$)/,
  },
}