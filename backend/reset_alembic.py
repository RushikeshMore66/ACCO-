import psycopg

conn = psycopg.connect('postgresql://postgres:9067717776@localhost:5432/acco_db', connect_timeout=5, autocommit=True)
cur = conn.cursor()

# Drop the empty alembic_version table so alembic can start fresh
cur.execute('DROP TABLE IF EXISTS alembic_version')
print('Dropped alembic_version table (was empty)')
cur.close()
conn.close()
