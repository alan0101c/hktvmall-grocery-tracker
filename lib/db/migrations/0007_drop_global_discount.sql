-- The app-wide global discount feature was removed: real HKTVmall promos are
-- per-product (extra 85/95折 tags), so a blanket rate was misleading.
-- app_settings existed solely to store that rate.
DROP TABLE IF EXISTS app_settings;
