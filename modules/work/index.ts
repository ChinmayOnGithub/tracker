/**
 * Work Module
 *
 * Capabilities: COMPLETABLE, AUDITABLE
 * Patterns: Timeline Pattern, Audit Pattern
 */

export * from './types';
export * from './actions';
export { WorkSessionService } from './services/WorkSessionService';
export { WorkSessionRepository } from './repository/WorkSessionRepository';
