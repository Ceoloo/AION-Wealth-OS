-- Shared reviewed guidance content (NOT private user data).
-- Fees/deadlines verified from official sources on 2026-09-12.
insert into public.content_sources
  (id, url, publisher, jurisdiction, reviewed_at, content_version, status, expiry_days, summary)
values
  ('ftc_credit_repair','https://consumer.ftc.gov/articles/fixing-your-credit-faqs','U.S. Federal Trade Commission','US','2026-09-12','2026-09','verified',365,
   'Companies that promise to repair credit cannot remove information that is both accurate and current; charging before delivering services is unlawful (CROA).'),
  ('irs_llc','https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc','U.S. Internal Revenue Service','US','2026-09-12','2026-09','verified',365,
   'An LLC is created under state law; federal tax treatment varies (disregarded/partnership by default; corporate by election on Form 8832).'),
  ('irs_ein','https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number','U.S. Internal Revenue Service','US','2026-09-12','2026-09','verified',365,
   'An EIN is obtained directly and free from the IRS.'),
  ('ny_articles','https://dos.ny.gov/articles-organization-domestic-limited-liability-company-0','New York Department of State','NY','2026-09-12','2026-09','verified',180,
   'Filing the Articles of Organization for a domestic NY LLC has a $200 filing fee.'),
  ('ny_publication','https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0','New York Department of State','NY','2026-09-12','2026-09','verified',180,
   'Within 120 days after formation, a NY LLC must publish in two newspapers; a Certificate of Publication is then filed with a $50 filing fee.'),
  ('ny_biennial','https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies','New York Department of State','NY','2026-09-12','2026-09','verified',180,
   'A NY LLC must file a Biennial Statement every two years with a $9 filing fee.'),
  ('annualcreditreport','https://www.annualcreditreport.com/','Annual Credit Report (federally authorized)','US','2026-09-12','2026-09','verified',365,
   'The federally authorized source for free credit reports from the three nationwide bureaus.')
on conflict (id) do update set
  url = excluded.url,
  publisher = excluded.publisher,
  jurisdiction = excluded.jurisdiction,
  reviewed_at = excluded.reviewed_at,
  content_version = excluded.content_version,
  status = excluded.status,
  expiry_days = excluded.expiry_days,
  summary = excluded.summary;
