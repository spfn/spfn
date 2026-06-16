/**
 * OAuth Client Libraries
 */

export * from './google';
export * from './state';
export * from './provider';
export * from './jwks-verify';

// provider 자기 등록(side-effect). 이 import로 registry에 google/apple이 채워진다.
import './google-provider';
import './apple-provider';
export { googleProvider } from './google-provider';
export { appleProvider } from './apple-provider';
