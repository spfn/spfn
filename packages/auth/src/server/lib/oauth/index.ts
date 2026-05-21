/**
 * OAuth Client Libraries
 */

export * from './google';
export * from './state';
export * from './provider';

// google provider 자기 등록(side-effect). 이 import로 registry에 google이 채워진다.
import './google-provider';
export { googleProvider } from './google-provider';
