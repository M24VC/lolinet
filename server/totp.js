import { authenticator } from 'otplib';

authenticator.options = {
  step: 30,
  window: [1, 1]
};

export function generateTfaSecret() {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(secret, accountName = 'admin', issuer = 'LoliNet') {
  return authenticator.keyuri(accountName, issuer, secret);
}

export function verifyTfaToken(secret, token) {
  return authenticator.verify({ token, secret });
}
