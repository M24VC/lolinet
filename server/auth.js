import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const sessions = new Map();
const tfaChallenges = new Map();

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const TFA_CHALLENGE_TTL_MS = 1000 * 60 * 3; // 3 minutes

// Periodic cleanup of expired sessions and 2FA challenges every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  }
  for (const [challengeToken, challenge] of tfaChallenges) {
    if (challenge.expiresAt < now) {
      tfaChallenges.delete(challengeToken);
    }
  }
}, 1000 * 60 * 10).unref();

export async function hashPassword(raw) {
  return bcrypt.hash(raw, 10);
}

export async function verifyPassword(raw, hash) {
  return bcrypt.compare(raw, hash);
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(userId) {
  const token = newSessionToken();
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token) {
  if (!token) return;
  sessions.delete(token);
}

export function destroySessionsForUser(userId) {
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token);
  }
}

export function createTfaChallenge(userId, username) {
  const challengeToken = crypto.randomBytes(32).toString('hex');
  tfaChallenges.set(challengeToken, {
    userId,
    username,
    expiresAt: Date.now() + TFA_CHALLENGE_TTL_MS
  });
  return challengeToken;
}

export function getTfaChallenge(challengeToken) {
  if (!challengeToken) return null;
  const entry = tfaChallenges.get(challengeToken);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tfaChallenges.delete(challengeToken);
    return null;
  }
  return entry;
}

export function consumeTfaChallenge(challengeToken) {
  const entry = getTfaChallenge(challengeToken);
  if (entry) {
    tfaChallenges.delete(challengeToken);
  }
  return entry;
}
