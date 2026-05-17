-- =============================================
-- Active Number Bot - Supabase Schema
-- Supabase SQL Editor এ এটি একবার run করুন
-- =============================================

-- Users table (balance & stats)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    balance FLOAT DEFAULT 0,
    total_numbers INTEGER DEFAULT 0,
    total_otps INTEGER DEFAULT 0,
    total_cost FLOAT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table (active number purchases)
CREATE TABLE IF NOT EXISTS orders (
    activation_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    price FLOAT NOT NULL,
    country_name TEXT,
    flag TEXT,
    service TEXT,
    phone TEXT,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table (deposit TxID dedup)
CREATE TABLE IF NOT EXISTS transactions (
    txid TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (important!)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Allow all via service_role (used from backend/Vercel)
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON transactions FOR ALL USING (true) WITH CHECK (true);
