CREATE TABLE IF NOT EXISTS upload_batches (
  id TEXT PRIMARY KEY,
  dataset_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  is_active INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  mapping_json TEXT NOT NULL DEFAULT '{}',
  validation_summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  description TEXT,
  variant TEXT,
  selling_price REAL,
  base_price REAL,
  current_stock REAL NOT NULL DEFAULT 0,
  minimum_stock REAL,
  FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_transaction_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  transaction_id TEXT,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  qty_sold REAL NOT NULL DEFAULT 0,
  gross_sales REAL,
  net_sales REAL,
  FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_summary_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  qty_sold REAL NOT NULL DEFAULT 0,
  gross_sales REAL,
  service_fee REAL,
  taxes REAL,
  net_sales REAL,
  FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_items (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  current_stock REAL NOT NULL DEFAULT 0,
  minimum_stock REAL,
  base_price REAL,
  qty_total REAL NOT NULL DEFAULT 0,
  sales_value_total REAL NOT NULL DEFAULT 0,
  period_days INTEGER NOT NULL DEFAULT 0,
  period_count INTEGER NOT NULL DEFAULT 0,
  frequency_score REAL NOT NULL DEFAULT 0,
  avg_monthly_sales REAL NOT NULL DEFAULT 0,
  avg_daily_sales REAL NOT NULL DEFAULT 0,
  coverage_days INTEGER,
  stock_status TEXT NOT NULL,
  movement_class TEXT NOT NULL,
  purchase_priority TEXT NOT NULL,
  recommended_order_qty REAL NOT NULL DEFAULT 0,
  priority_score REAL NOT NULL DEFAULT 0,
  reason_json TEXT NOT NULL DEFAULT '[]',
  dead_stock_flag INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analysis_summary (
  id TEXT PRIMARY KEY,
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_out_of_stock INTEGER NOT NULL DEFAULT 0,
  total_low_stock INTEGER NOT NULL DEFAULT 0,
  total_fast_moving INTEGER NOT NULL DEFAULT 0,
  total_slow_moving INTEGER NOT NULL DEFAULT 0,
  total_dead_moving INTEGER NOT NULL DEFAULT 0,
  total_priority_buy INTEGER NOT NULL DEFAULT 0,
  estimated_restock_value REAL NOT NULL DEFAULT 0,
  has_partial_costing INTEGER NOT NULL DEFAULT 0,
  coverage_start TEXT,
  coverage_end TEXT,
  coverage_days INTEGER NOT NULL DEFAULT 0,
  stock_distribution_json TEXT NOT NULL DEFAULT '[]',
  movement_distribution_json TEXT NOT NULL DEFAULT '[]'
);
