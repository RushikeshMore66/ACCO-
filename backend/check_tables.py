import psycopg
conn = psycopg.connect('postgresql://postgres:9067717776@localhost:5432/acco_db', connect_timeout=5)
cur = conn.cursor()

# Check alembic state
cur.execute("SELECT version_num FROM alembic_version")
versions = cur.fetchall()
print('Alembic versions:', versions)

# Check tables
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [row[0] for row in cur.fetchall()]
print('Tables:', tables)

# Check enum types
cur.execute("SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname")
enums = [row[0] for row in cur.fetchall()]
print('Enum types:', enums)
cur.close()
conn.close()
