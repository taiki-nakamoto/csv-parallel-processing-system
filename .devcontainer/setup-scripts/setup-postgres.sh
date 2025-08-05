#!/bin/bash
set -e

echo "Setting up PostgreSQL..."

# PostgreSQL接続確認
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL setup completed."
echo "Connection: postgresql://postgres:postgres123@localhost:5432/csv_processing"