const MOBILE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function validateMobile(s: string): boolean {
  return MOBILE_RE.test(s);
}

export function validateEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}
