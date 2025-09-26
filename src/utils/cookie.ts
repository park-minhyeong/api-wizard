// 전역 쿠키 저장소
let globalCookies = "";

class CookieConfig {
  constructor(cookies: string) {
    globalCookies = cookies;
  }
}

export function getCookies(): string {
  if (typeof document !== 'undefined') {
    return document.cookie;
  }
  return globalCookies;
}

export { CookieConfig };