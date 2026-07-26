import { configureI18n } from '@spfn/i18n/server';
import { catalogs } from './catalogs';

configureI18n({
    catalogs,
    fallbackLocale: 'en',
});

export { getClientMessages, getT } from '@spfn/i18n/server';
