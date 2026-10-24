const interpolate = (text: string, values?: Record<string, unknown>) =>
 text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? ''));
export const i18nMock = {useTranslation: () => ({t: (key: string, o?: Record<string, unknown> & {defaultValue?: string}) => interpolate(o?.defaultValue ?? key, o), i18n: {language: 'en'}})};
