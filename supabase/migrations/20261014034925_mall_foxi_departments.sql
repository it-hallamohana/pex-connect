-- Mirror the department names found in FOXI source; never read hotel tables.
-- Existing IDs and references are preserved. Legacy Mall-only departments stay
-- available in history but are not offered for new registrations or requests.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mall;
INSERT INTO mall.departments(code,name,is_active) VALUES
('ACC','Accounting',true),
('AG','Administration & General',true),
('BAN','Banquet',true),
('ENG','Engineering',true),
('FBS','F&B Service',true),
('FC','Finance Control',true),
('FO','Front Office',true),
('HR','HR',true),
('HK','Housekeeping',true),
('IA','Income Audit',true),
('IT','IT',true),
('KIT','Kitchen',true),
('LND','Laundry',true),
('MKT','Marketing',true),
('MOD','MOD',true),
('PA','Public Area',true),
('RES','Reservation',true),
('FB','Restaurant',true),
('RM','Room Maintenance',true),
('SLS','Sales',true),
('SEC','Security',true),
('SPA','Spa',true)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,is_active=true;
UPDATE mall.departments SET is_active=false WHERE code IN ('CS','TR');
COMMIT;
