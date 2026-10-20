-- Read-only audit of money stored before currencies were validated per ISO 4217.
-- Nothing here writes; it reports the rows a reviewer should look at after the currency
-- change. Run it against the target database, for example:
--   psql "$DATABASE_URL" -f tunes/scripts/money-data-audit.sql
--
-- active_codes must equal CURRENCY_CODES in shared/currency.ts (a test keeps them equal).
\set active_codes 'AED,AFN,ALL,AMD,AOA,ARS,AUD,AWG,AZN,BAM,BBD,BDT,BHD,BIF,BMD,BND,BOB,BRL,BSD,BTN,BWP,BYN,BZD,CAD,CDF,CHF,CLP,CNY,COP,CRC,CUP,CVE,CZK,DJF,DKK,DOP,DZD,EGP,ERN,ETB,EUR,FJD,FKP,GBP,GEL,GHS,GIP,GMD,GNF,GTQ,GYD,HKD,HNL,HTG,HUF,IDR,ILS,INR,IQD,IRR,ISK,JMD,JOD,JPY,KES,KGS,KHR,KMF,KPW,KRW,KWD,KYD,KZT,LAK,LBP,LKR,LRD,LSL,LYD,MAD,MDL,MGA,MKD,MMK,MNT,MOP,MRU,MUR,MVR,MWK,MXN,MYR,MZN,NAD,NGN,NIO,NOK,NPR,NZD,OMR,PAB,PEN,PGK,PHP,PKR,PLN,PYG,QAR,RON,RSD,RUB,RWF,SAR,SBD,SCR,SDG,SEK,SGD,SHP,SLE,SOS,SRD,SSP,STN,SVC,SYP,SZL,THB,TJS,TMT,TND,TOP,TRY,TTD,TWD,TZS,UAH,UGX,USD,UYU,UZS,VED,VES,VND,VUV,WST,XAF,XCD,XCG,XOF,XPF,YER,ZAR,ZMW,ZWG'

-- Products: one row per owner's offer.
SELECT count(*)                                                                    AS offers,
       count(*) FILTER (WHERE price IS NOT NULL AND currency_code IS NULL)         AS price_without_currency,
       count(*) FILTER (WHERE price IS NULL AND currency_code IS NOT NULL)         AS currency_without_price,
       count(*) FILTER (WHERE price = 0)                                           AS zero_price_now_shown_as_free,
       count(*) FILTER (WHERE currency_code IN ('ANG','BGN','CUC','HRK','MRO','SLL','STD','VEF','ZWL','BYR')) AS withdrawn_code,
       count(*) FILTER (WHERE currency_code IS NOT NULL AND currency_code !~ '^[A-Z]{3}$') AS malformed_code
FROM product_recommendation_context;
-- Prices whose decimals exceed their currency's minor units (rendered rounded; the write path would now refuse them).
SELECT p.currency_code, count(*) FROM product_recommendation_context p
JOIN (VALUES ('JPY',0),('KRW',0),('VND',0),('ISK',0),('CLP',0),('UGX',0),('XOF',0),('XAF',0),('XPF',0),('BIF',0),('DJF',0),('GNF',0),('KMF',0),('PYG',0),('RWF',0),('VUV',0),('BYR',0),
 ('KWD',3),('BHD',3),('OMR',3),('JOD',3),('TND',3),('LYD',3),('IQD',3)) u(code,digits) ON u.code=p.currency_code
WHERE p.price <> round(p.price, u.digits) GROUP BY 1
UNION ALL
SELECT currency_code, count(*) FROM product_recommendation_context WHERE currency_code IS NOT NULL AND price <> round(price,2)
  AND currency_code NOT IN ('JPY','KRW','VND','ISK','CLP','UGX','XOF','XAF','XPF','BIF','DJF','GNF','KMF','PYG','RWF','VUV','BYR','KWD','BHD','OMR','JOD','TND','LYD','IQD') GROUP BY 1;
-- Guide estimates (column numeric(14,2)).
SELECT count(*) FILTER (WHERE estimated_budget IS NOT NULL)                        AS estimates,
       count(*) FILTER (WHERE estimated_budget = 0)                                AS zero_estimates,
       count(*) FILTER (WHERE budget_currency IN ('KWD','BHD','OMR','JOD','TND','LYD','IQD')) AS three_digit_currency_estimates,
       count(*) FILTER (WHERE budget_currency IN ('JPY','KRW','VND','ISK','CLP','UGX','XOF','XAF','XPF')) AS zero_digit_currency_estimates,
       count(*) FILTER (WHERE budget_currency IS NOT NULL AND budget_currency NOT IN (SELECT unnest(string_to_array(:'active_codes', ',')))) AS code_outside_the_table
FROM guide_collection_details;
-- Per-place budgets inside section blocks (jsonb): amount present, currency outside the table, amount with decimals the currency lacks.
SELECT count(*)                                                                    AS budget_entries,
       count(*) FILTER (WHERE (e->>'budgetAmount')::numeric = 0)                   AS zero_amount,
       count(*) FILTER (WHERE e->>'budgetCurrency' NOT IN (SELECT unnest(string_to_array(:'active_codes', ',')))) AS code_outside_the_table,
       count(*) FILTER (WHERE e->>'budgetCurrency' IN ('JPY','KRW','VND','ISK','CLP','UGX','XOF','XAF','XPF') AND (e->>'budgetAmount')::numeric <> trunc((e->>'budgetAmount')::numeric)) AS fraction_in_zero_digit_currency
FROM guide_sections s
CROSS JOIN LATERAL jsonb_path_query(s.blocks, '$.budget.*[*] ? (@.budgetAmount != null)') AS e;
-- Free text that was stored as the money display and cannot be re-read as an amount.
SELECT count(*) FILTER (WHERE e->>'customBudget' IS NOT NULL) AS custom_budget_text,
       count(*) FILTER (WHERE e->>'priceRange'   IS NOT NULL) AS price_range_text
FROM guide_sections s
CROSS JOIN LATERAL jsonb_path_query(s.blocks, '$.budget.*[*]') AS e;
